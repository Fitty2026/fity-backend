import sharp from 'sharp';

const DEFAULT_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const OUTPUT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const INPUT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const adapterError = (code, message, cause) => Object.assign(
    new Error(message, cause ? { cause } : undefined),
    { code }
);

const positiveTimeout = (value) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 300000
        ? parsed
        : DEFAULT_TIMEOUT_MS;
};

const categorySlot = (category) => ({
    TOP: 'top', BOTTOM: 'bottom', OUTER: 'outer', DRESS: 'overall',
    SHOES: 'shoes', BAG: 'bag', ACCESSORY: 'accessory'
}[category] ?? 'item');

const chooseOutfitItems = (snapshot = {}) => {
    const selected = Array.isArray(snapshot.selectedItems) ? snapshot.selectedItems : [];
    const pool = Array.isArray(snapshot.closetItemPool) ? snapshot.closetItemPool : [];
    const chosen = [];
    const categories = new Set();

    for (const item of [...selected, ...pool]) {
        if (!Number.isSafeInteger(item?.itemId) || item.itemId <= 0 || !item.imageRef?.assetId) continue;
        const category = typeof item.category === 'string' ? item.category : 'OTHER';
        if (categories.has(category)) continue;
        categories.add(category);
        chosen.push({ ...item, category, slot: categorySlot(category) });
        if (chosen.length === 3) break;
    }
    return chosen;
};

const promptFor = (snapshot, items) => {
    const body = snapshot?.bodyProfile ?? {};
    const styles = (snapshot?.stylePreferences ?? []).map((style) => style.name ?? style.code).filter(Boolean);
    const itemText = items.map((item, index) => (
        `${index + 1}. ${item.category}, tags: ${(item.tags ?? []).join(', ') || 'none'}`
    )).join('\n');
    return [
        'Create one photorealistic full-body fashion editorial image of an anonymous adult virtual model.',
        'Dress the model using the supplied garment reference images. Preserve each garment color, pattern, silhouette, and visible details.',
        'Use a clean neutral studio background, natural pose, realistic proportions, no text, no logo additions, and no collage layout.',
        'Do not recreate or infer the identity of any real person. The input images are garment references only.',
        `Body styling context: balance=${body.bodyBalance ?? 'unknown'}, shoulders=${body.shoulderWidth ?? 'unknown'}, frame=${body.frameSize ?? 'unknown'}.`,
        `Preferred styles: ${styles.join(', ') || 'unspecified'}.`,
        `Situation: ${snapshot?.moodContext?.type ?? 'unspecified'}. Date: ${snapshot?.selectedDate ?? 'unspecified'}.`,
        `Weather: ${snapshot?.weatherContext?.condition ?? 'unspecified'}, temperature=${snapshot?.weatherContext?.temperature ?? 'unspecified'}.`,
        `Garment references in the following image order:\n${itemText}`
    ].join('\n');
};

const findOutputImage = (data) => {
    for (const candidate of data?.candidates ?? []) {
        const image = candidate?.content?.parts?.find((part) => part?.inlineData?.data)?.inlineData;
        if (image) return image;
    }
    return null;
};

const normalizeInputImage = async ({ asset, buffer }) => {
    if (INPUT_MIME_TYPES.has(asset.mimeType)) return { buffer, mimeType: asset.mimeType };
    if (!['image/heic', 'image/heif'].includes(asset.mimeType)) {
        throw adapterError('AI_INVALID_INPUT', 'A closet image has an unsupported format.');
    }
    try {
        return { buffer: await sharp(buffer).png().toBuffer(), mimeType: 'image/png' };
    } catch (cause) {
        throw adapterError('AI_INVALID_INPUT', 'A closet image could not be converted for Gemini.', cause);
    }
};

const decodeOutput = (image) => {
    const mimeType = image?.mime_type ?? image?.mimeType;
    if (!OUTPUT_MIME_TYPES.has(mimeType) || typeof image?.data !== 'string' || !image.data.trim()) {
        throw adapterError('AI_INVALID_RESPONSE', 'Gemini did not return a supported image.');
    }
    if (image.data.length > Math.ceil(MAX_OUTPUT_BYTES * 4 / 3) + 4) {
        throw adapterError('AI_INVALID_RESPONSE', 'Gemini returned an image that is too large.');
    }
    const buffer = Buffer.from(image.data, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_OUTPUT_BYTES) {
        throw adapterError('AI_INVALID_RESPONSE', 'Gemini returned an invalid image size.');
    }
    return { buffer, mimeType };
};

export class GeminiOutfitAiAdapter {
    constructor({
        apiKey = process.env.GEMINI_API_KEY,
        model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL,
        endpoint = process.env.GEMINI_IMAGE_API_URL,
        timeoutMs = positiveTimeout(process.env.GEMINI_IMAGE_TIMEOUT_MS),
        fetchImpl = globalThis.fetch,
        imageService
    } = {}) {
        this.apiKey = apiKey;
        this.model = model;
        this.endpoint = endpoint || `${DEFAULT_API_BASE_URL}/models/${this.model}:generateContent`;
        this.timeoutMs = positiveTimeout(timeoutMs);
        this.fetch = fetchImpl;
        this.imageService = imageService;
    }

    async generate({ userId, inputSnapshot }) {
        if (!this.apiKey) throw adapterError('AI_NOT_CONFIGURED', 'Gemini API key is not configured.');
        if (!this.imageService) throw adapterError('AI_NOT_CONFIGURED', 'Generated image storage is not configured.');
        let endpoint;
        try {
            endpoint = new URL(this.endpoint);
        } catch (cause) {
            throw adapterError('AI_NOT_CONFIGURED', 'Gemini endpoint is invalid.', cause);
        }
        if (endpoint.protocol !== 'https:') throw adapterError('AI_NOT_CONFIGURED', 'Gemini endpoint must use HTTPS.');
        const items = chooseOutfitItems(inputSnapshot);
        if (items.length === 0) throw adapterError('AI_INVALID_INPUT', 'No usable closet image was provided.');

        const parts = [{ text: promptFor(inputSnapshot, items) }];
        for (const item of items) {
            const content = await this.imageService.getImageContent({
                imageId: item.imageRef.assetId,
                ownerUserId: userId
            });
            const { buffer, mimeType } = await normalizeInputImage(content);
            parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetch(this.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: {
                        responseModalities: ['IMAGE'],
                        imageConfig: { aspectRatio: '3:4', imageSize: '1K' }
                    }
                })
            });
            if (!response.ok) throw adapterError('AI_UNAVAILABLE', `Gemini returned ${response.status}.`);
            const data = await response.json().catch((cause) => {
                throw adapterError('AI_INVALID_RESPONSE', 'Gemini returned invalid JSON.', cause);
            });
            const { buffer, mimeType } = decodeOutput(findOutputImage(data));
            const stored = await this.imageService.createGeneratedImage({
                ownerUserId: userId,
                file: {
                    buffer,
                    mimetype: mimeType,
                    originalname: `gemini-outfit.${mimeType.split('/')[1]}`,
                    size: buffer.length
                }
            });
            return {
                generatedImageUrl: stored.imageUrl,
                outfitItems: items.map(({ slot, itemId }) => ({ slot, itemId })),
                recommendedClosetItemIds: items.map(({ itemId }) => itemId),
                provider: 'google-gemini',
                modelVersion: this.model,
                promptVersion: 'fitty-outfit-v1',
                fallbackUsed: false
            };
        } catch (error) {
            if (error.name === 'AbortError') throw adapterError('AI_TIMEOUT', 'Gemini outfit generation timed out.');
            if (error.code) throw error;
            throw adapterError('AI_UNAVAILABLE', 'Gemini outfit generation failed.', error);
        } finally {
            clearTimeout(timeout);
        }
    }
}
