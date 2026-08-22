import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { OutfitPreviewFallbackAdapter } from '../src/services/outfit-preview-fallback.service.js';

describe('OutfitPreviewFallbackAdapter', () => {
    it('stores a preview made from the exact recommended closet items', async () => {
        const source = await sharp({
            create: { width: 120, height: 160, channels: 3, background: '#333333' }
        }).png().toBuffer();
        const reads = [];
        let stored;
        const adapter = new OutfitPreviewFallbackAdapter({
            imageService: {
                async getImageContent(input) {
                    reads.push(input);
                    return { asset: { mimeType: 'image/png' }, buffer: source };
                },
                async createGeneratedImage(input) {
                    stored = input;
                    return { imageUrl: '/api/v1/images/88/content' };
                }
            }
        });

        const result = await adapter.generate({
            userId: 7,
            closetItemIds: [11, 12, 13],
            inputSnapshot: {
                closetItemPool: [
                    { itemId: 11, category: 'TOP', imageRef: { assetId: 101 } },
                    { itemId: 12, category: 'BOTTOM', imageRef: { assetId: 102 } },
                    { itemId: 13, category: 'SHOES', imageRef: { assetId: 103 } }
                ]
            }
        });

        assert.deepEqual(reads, [
            { imageId: 101, ownerUserId: 7 },
            { imageId: 102, ownerUserId: 7 },
            { imageId: 103, ownerUserId: 7 }
        ]);
        assert.equal(stored.fallback, true);
        assert.equal(stored.file.mimetype, 'image/png');
        assert.deepEqual(await sharp(stored.file.buffer).metadata().then(({ width, height }) => ({ width, height })), {
            width: 768,
            height: 1024
        });
        assert.equal(result.generatedImageUrl, '/api/v1/images/88/content');
        assert.equal(result.provider, 'fitty-preview-fallback');
        assert.equal(result.fallbackUsed, true);
        assert.deepEqual(result.recommendedClosetItemIds, [11, 12, 13]);
        assert.deepEqual(result.outfitItems, [
            { slot: 'top', itemId: 11 },
            { slot: 'bottom', itemId: 12 },
            { slot: 'shoes', itemId: 13 }
        ]);
    });
});
