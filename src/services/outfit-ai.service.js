const adapterError = (code, message) => Object.assign(new Error(message), { code });

export class OutfitAiAdapter {
    constructor({ endpoint = process.env.AI_OUTFIT_ADAPTER_URL, timeoutMs = Number(process.env.AI_OUTFIT_ADAPTER_TIMEOUT_MS || 10000), fetchImpl = globalThis.fetch } = {}) {
        this.endpoint = endpoint;
        this.timeoutMs = timeoutMs;
        this.fetch = fetchImpl;
    }

    async generate({ jobId, userId, bodyProfileId, closetItemIds, styleTagIds, inputSchemaVersion, inputSnapshot, situation, selectedDate, weather }) {
        if (!this.endpoint) throw adapterError('AI_NOT_CONFIGURED', 'AI outfit adapter is not configured.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const weatherContext = inputSnapshot?.weatherContext ?? weather;
        try {
            const response = await this.fetch(this.endpoint, {
                method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
                body: JSON.stringify({
                    requestId: `outfit-job-${jobId}`,
                    outfitJobId: String(jobId),
                    userId: String(userId),
                    inputSchemaVersion: inputSchemaVersion || inputSnapshot?.schemaVersion || 'outfit-input-v1',
                    bodyProfile: inputSnapshot?.bodyProfile ?? { id: bodyProfileId },
                    stylePreferences: inputSnapshot?.stylePreferences ?? styleTagIds.map((styleTagId) => ({ styleTagId })),
                    selectedItems: inputSnapshot?.selectedItems ?? closetItemIds.map((itemId) => ({ itemId })),
                    closetItemPool: inputSnapshot?.closetItemPool ?? closetItemIds.map((itemId) => ({ itemId })),
                    moodContext: inputSnapshot?.moodContext ?? (situation ? { type: situation } : null),
                    selectedDate: inputSnapshot?.selectedDate ?? selectedDate,
                    weatherContext: weatherContext
                        ? { ...weatherContext, rain: weatherContext.condition === 'RAINY' }
                        : null
                })
            });
            if (!response.ok) throw adapterError('AI_UNAVAILABLE', `AI outfit adapter returned ${response.status}.`);
            const data = await response.json().catch(() => { throw adapterError('AI_INVALID_RESPONSE', 'AI outfit adapter returned invalid JSON.'); });
            const outfitItems = Array.isArray(data?.outfitItems) ? data.outfitItems : null;
            const outfitItemsValid = !outfitItems || outfitItems.every((item) => item
                && typeof item.slot === 'string' && item.slot.trim()
                && Number.isSafeInteger(item.itemId) && item.itemId > 0)
                && (!outfitItems || new Set(outfitItems.map((item) => item.slot.trim())).size === outfitItems.length);
            const recommendedClosetItemIds = Array.isArray(data?.recommendedClosetItemIds)
                ? data.recommendedClosetItemIds
                : outfitItems?.map((item) => item.itemId);
            if (!data || typeof data.generatedImageUrl !== 'string' || !/^https?:\/\//.test(data.generatedImageUrl)
                || !outfitItemsValid
                || !Array.isArray(recommendedClosetItemIds)
                || recommendedClosetItemIds.length === 0
                || !recommendedClosetItemIds.every((id) => Number.isSafeInteger(id) && id > 0)
                || typeof data.modelVersion !== 'string' || !data.modelVersion.trim()) {
                throw adapterError('AI_INVALID_RESPONSE', 'AI outfit adapter response did not match the contract.');
            }
            return {
                generatedImageUrl: data.generatedImageUrl,
                outfitItems: outfitItems?.map((item) => ({ slot: item.slot.trim(), itemId: item.itemId })) ?? null,
                recommendedClosetItemIds: [...new Set(recommendedClosetItemIds)],
                provider: data.provider || 'fitty-ai',
                modelVersion: data.modelVersion.trim(),
                promptVersion: typeof data.promptVersion === 'string' && data.promptVersion.trim() ? data.promptVersion.trim() : null,
                fallbackUsed: false
            };
        } catch (error) {
            if (error.name === 'AbortError') throw adapterError('AI_TIMEOUT', 'AI outfit generation timed out.');
            throw error;
        } finally { clearTimeout(timeout); }
    }
}
