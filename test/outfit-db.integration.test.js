import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disconnectPrisma, getPrisma } from '../src/config/prisma.js';
import { OutfitRepository } from '../src/repositories/outfit.repository.js';
import { OutfitService } from '../src/services/outfit.service.js';

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === '1';

test('persists the authenticated outfit lifecycle in MySQL', { skip: !runDatabaseIntegration }, async () => {
    const prisma = getPrisma();
    const suffix = `${Date.now()}-${process.pid}`;
    let ownerId;
    let otherUserId;

    try {
        const owner = await prisma.user.create({
            data: { email: `outfit-owner-${suffix}@example.com`, name: 'Outfit owner' }
        });
        const otherUser = await prisma.user.create({
            data: { email: `outfit-other-${suffix}@example.com`, name: 'Other user' }
        });
        ownerId = owner.id;
        otherUserId = otherUser.id;

        const image = await prisma.imageAsset.create({
            data: {
                userId: owner.id,
                imageType: 'CLOSET_ITEM',
                storageProvider: 'integration-test',
                storageKey: `outfit-integration/${suffix}.png`,
                mimeType: 'image/png',
                fileSizeBytes: 128,
                checksumSha256: 'a'.repeat(64),
                status: 'ACTIVE'
            }
        });
        const closetItem = await prisma.closetItem.create({
            data: {
                userId: owner.id,
                imageId: image.id,
                name: 'Integration shirt',
                size: 'M',
                category: 'TOP',
                importType: 'MANUAL'
            }
        });
        await prisma.bodyProfile.create({ data: { userId: owner.id } });

        const service = new OutfitService({
            repository: new OutfitRepository(prisma),
            aiAdapter: {
                generate: async () => ({
                    generatedImageUrl: 'https://images.example.com/integration-outfit.png',
                    provider: 'integration-test',
                    modelVersion: 'integration-v1',
                    promptVersion: null,
                    fallbackUsed: false,
                    recommendedClosetItemIds: [closetItem.id]
                })
            }
        });

        const created = await service.createGenerationJob(owner.id, {
            closetItemIds: [closetItem.id],
            situation: 'WORK',
            selectedDate: '2026-07-31',
            weather: { temperature: 26, condition: 'SUNNY' }
        });
        assert.equal(created.status, 'queued');
        assert.equal(created.isExistingJob, false);

        await assert.rejects(
            () => service.getGenerationJob(otherUser.id, created.jobId),
            { code: 'NOT_FOUND404' }
        );

        await service.processGenerationJob(created.jobId);
        const completed = await service.getGenerationJob(owner.id, created.jobId);
        assert.equal(completed.status, 'completed');
        assert.equal(completed.progress, 100);
        assert.ok(completed.outfitResultId);

        const saved = await service.saveOutfit(owner.id, {
            outfitResultId: completed.outfitResultId,
            name: 'DB outfit',
            tags: ['work'],
            memo: 'Persisted through Prisma'
        });
        assert.equal(saved.items[0], closetItem.id);

        await service.deleteSavedOutfit(owner.id, saved.id);
        assert.equal((await service.getDeletedSavedOutfits(owner.id, {})).pagination.totalCount, 1);
        await service.restoreSavedOutfit(owner.id, saved.id);
        assert.equal((await service.getSavedOutfits(owner.id, {})).pagination.totalCount, 1);
        await service.deleteSavedOutfit(owner.id, saved.id);
        await service.permanentlyDeleteSavedOutfit(owner.id, saved.id);
        assert.equal((await service.getDeletedSavedOutfits(owner.id, {})).pagination.totalCount, 0);
    } finally {
        if (ownerId) {
            await prisma.outfitRevision.deleteMany({ where: { userId: ownerId } });
            await prisma.savedOutfit.deleteMany({ where: { userId: ownerId } });
            await prisma.outfitResult.deleteMany({ where: { userId: ownerId } });
            await prisma.outfitGenerationJob.deleteMany({ where: { userId: ownerId } });
            await prisma.closetItem.deleteMany({ where: { userId: ownerId } });
            await prisma.bodyProfile.deleteMany({ where: { userId: ownerId } });
            await prisma.imageAsset.deleteMany({ where: { userId: ownerId } });
            await prisma.user.deleteMany({ where: { id: ownerId } });
        }
        if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
        await disconnectPrisma();
    }
});
