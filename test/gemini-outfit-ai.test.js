import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GeminiOutfitAiAdapter } from '../src/services/gemini-outfit-ai.service.js';

const snapshot = {
    bodyProfile: { id: 7, bodyBalance: 'BALANCED', shoulderWidth: 'AVERAGE', frameSize: 'MEDIUM' },
    stylePreferences: [{ styleTagId: 2, code: 'MINIMAL', name: 'Minimal' }],
    selectedItems: [{ itemId: 4, category: 'TOP', tags: ['white'], imageRef: { assetId: 14 } }],
    closetItemPool: [
        { itemId: 4, category: 'TOP', tags: ['white'], imageRef: { assetId: 14 } },
        { itemId: 5, category: 'TOP', tags: ['navy'], imageRef: { assetId: 15 } },
        { itemId: 6, category: 'BOTTOM', tags: ['black'], imageRef: { assetId: 16 } }
    ],
    moodContext: { type: 'DATE' },
    selectedDate: '2026-08-13',
    weatherContext: { condition: 'SUNNY', temperature: 28 }
};

const createImageService = () => {
    const reads = [];
    const writes = [];
    return {
        reads,
        writes,
        async getImageContent({ imageId, ownerUserId }) {
            reads.push({ imageId, ownerUserId });
            return { asset: { id: imageId, mimeType: 'image/png' }, buffer: Buffer.from(`image-${imageId}`) };
        },
        async createGeneratedImage(input) {
            writes.push(input);
            return { imageUrl: '/api/v1/images/99/content' };
        }
    };
};

describe('GeminiOutfitAiAdapter', () => {
    it('sends owned closet images to Gemini and stores the generated image', async () => {
        const imageService = createImageService();
        let request;
        const adapter = new GeminiOutfitAiAdapter({
            apiKey: 'test-key',
            model: 'gemini-test-image',
            endpoint: 'https://gemini.test/interactions',
            imageService,
            fetchImpl: async (url, options) => {
                request = { url, options, body: JSON.parse(options.body) };
                return new Response(JSON.stringify({
                    output_image: { mime_type: 'image/png', data: Buffer.from('generated-image').toString('base64') }
                }), { status: 200 });
            }
        });

        const result = await adapter.generate({ userId: 1, inputSnapshot: snapshot });

        assert.equal(request.url, 'https://gemini.test/interactions');
        assert.equal(request.options.headers['x-goog-api-key'], 'test-key');
        assert.equal(request.body.model, 'gemini-test-image');
        assert.equal(request.body.input.filter((part) => part.type === 'image').length, 2);
        assert.deepEqual(imageService.reads, [{ imageId: 14, ownerUserId: 1 }, { imageId: 16, ownerUserId: 1 }]);
        assert.equal(imageService.writes[0].ownerUserId, 1);
        assert.equal(imageService.writes[0].file.buffer.toString(), 'generated-image');
        assert.deepEqual(result.outfitItems, [{ slot: 'top', itemId: 4 }, { slot: 'bottom', itemId: 6 }]);
        assert.deepEqual(result.recommendedClosetItemIds, [4, 6]);
        assert.equal(result.generatedImageUrl, '/api/v1/images/99/content');
        assert.equal(result.provider, 'google-gemini');
        assert.equal(result.fallbackUsed, false);
    });

    it('accepts an image from the model output steps response', async () => {
        const adapter = new GeminiOutfitAiAdapter({
            apiKey: 'test-key', imageService: createImageService(),
            fetchImpl: async () => new Response(JSON.stringify({
                steps: [{ type: 'model_output', content: [
                    { type: 'text', text: 'done' },
                    { type: 'image', mime_type: 'image/jpeg', data: Buffer.from('jpeg-output').toString('base64') }
                ] }]
            }), { status: 200 })
        });
        const result = await adapter.generate({ userId: 1, inputSnapshot: snapshot });
        assert.equal(result.provider, 'google-gemini');
    });

    it('fails closed when the key, input image, or output image is missing', async () => {
        await assert.rejects(
            () => new GeminiOutfitAiAdapter({ imageService: createImageService() }).generate({ userId: 1, inputSnapshot: snapshot }),
            { code: 'AI_NOT_CONFIGURED' }
        );
        await assert.rejects(
            () => new GeminiOutfitAiAdapter({ apiKey: 'key', imageService: createImageService() }).generate({ userId: 1, inputSnapshot: {} }),
            { code: 'AI_INVALID_INPUT' }
        );
        await assert.rejects(
            () => new GeminiOutfitAiAdapter({
                apiKey: 'key', imageService: createImageService(),
                fetchImpl: async () => new Response(JSON.stringify({ output_text: 'no image' }), { status: 200 })
            }).generate({ userId: 1, inputSnapshot: snapshot }),
            { code: 'AI_INVALID_RESPONSE' }
        );
    });

    it('maps API rejection and timeout to stable adapter errors', async () => {
        const rejected = new GeminiOutfitAiAdapter({
            apiKey: 'key', imageService: createImageService(),
            fetchImpl: async () => new Response('rate limited', { status: 429 })
        });
        await assert.rejects(() => rejected.generate({ userId: 1, inputSnapshot: snapshot }), { code: 'AI_UNAVAILABLE' });

        const timedOut = new GeminiOutfitAiAdapter({
            apiKey: 'key', imageService: createImageService(), timeoutMs: 5,
            fetchImpl: (_, { signal }) => new Promise((_, reject) => {
                signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
            })
        });
        await assert.rejects(() => timedOut.generate({ userId: 1, inputSnapshot: snapshot }), { code: 'AI_TIMEOUT' });
    });
});
