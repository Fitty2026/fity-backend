import sharp from 'sharp';

const WIDTH = 768;
const HEIGHT = 1024;
const CARD_WIDTH = 640;
const CARD_HEIGHT = 250;
const CARD_X = 64;
const CARD_Y = [98, 387, 676];

const categorySlot = (category) => ({
    TOP: 'top', BOTTOM: 'bottom', OUTER: 'outer', DRESS: 'overall',
    SHOES: 'shoes', BAG: 'bag', ACCESSORY: 'accessory'
}[category] ?? 'item');

const selectedSnapshots = (snapshot, itemIds) => {
    const items = [...(snapshot?.selectedItems ?? []), ...(snapshot?.closetItemPool ?? [])];
    const byId = new Map(items.map((item) => [item.itemId, item]));
    return itemIds.map((itemId) => byId.get(itemId)).filter(Boolean);
};

const backgroundSvg = Buffer.from(`
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f5f5f3"/>
  <rect x="64" y="38" width="72" height="8" rx="4" fill="#1d1d1f"/>
  <rect x="144" y="38" width="32" height="8" rx="4" fill="#9d8df1"/>
  ${CARD_Y.map((y) => `<rect x="${CARD_X}" y="${y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="18" fill="#ffffff"/>`).join('')}
</svg>`);

export class OutfitPreviewFallbackAdapter {
    constructor({ imageService }) {
        this.imageService = imageService;
    }

    async generate({ userId, closetItemIds, inputSnapshot }) {
        if (!this.imageService) throw new Error('Fallback image storage is not configured.');
        const items = selectedSnapshots(inputSnapshot, closetItemIds);
        if (items.length !== closetItemIds.length || items.length === 0) {
            throw new Error('Fallback closet images are incomplete.');
        }

        const composites = [{ input: backgroundSvg, left: 0, top: 0 }];
        for (const [index, item] of items.slice(0, 3).entries()) {
            const { buffer } = await this.imageService.getImageContent({
                imageId: item.imageRef.assetId,
                ownerUserId: userId
            });
            const normalized = await sharp(buffer, { failOn: 'error' })
                .rotate()
                .resize(CARD_WIDTH - 48, CARD_HEIGHT - 28, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                })
                .png()
                .toBuffer();
            const metadata = await sharp(normalized).metadata();
            composites.push({
                input: normalized,
                left: Math.round((WIDTH - metadata.width) / 2),
                top: CARD_Y[index] + Math.round((CARD_HEIGHT - metadata.height) / 2)
            });
        }

        const buffer = await sharp({
            create: { width: WIDTH, height: HEIGHT, channels: 4, background: '#f5f5f3' }
        }).composite(composites).png().toBuffer();
        const stored = await this.imageService.createGeneratedImage({
            ownerUserId: userId,
            fallback: true,
            file: {
                buffer,
                mimetype: 'image/png',
                originalname: 'outfit-preview.png',
                size: buffer.length
            }
        });

        return {
            generatedImageUrl: stored.imageUrl,
            recommendedClosetItemIds: [...closetItemIds],
            outfitItems: items.map((item) => ({ slot: categorySlot(item.category), itemId: item.itemId })),
            provider: 'fitty-preview-fallback',
            modelVersion: 'preview-v1',
            promptVersion: null,
            fallbackUsed: true
        };
    }
}
