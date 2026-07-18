import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { requireOutfitAuth } from "../src/middlewares/outfit-auth.middleware.js";
import {
    createGenerationJob,
    deleteSavedOutfit,
    getGenerationJob,
    getSavedOutfits,
    resetOutfitStoreForTest,
    saveOutfit
} from "../src/services/outfit.service.js";

beforeEach(() => {
    resetOutfitStoreForTest();
});

describe("BE4 outfit auth middleware", () => {
    it("rejects requests without an authenticated user context", () => {
        let statusCode;
        let payload;
        const req = { get: () => "" };
        const res = {
            status(code) {
                statusCode = code;
                return this;
            },
            json(body) {
                payload = body;
                return body;
            }
        };

        requireOutfitAuth(req, res, () => {
            throw new Error("next should not be called");
        });

        assert.equal(statusCode, 401);
        assert.equal(payload.code, "AUTH401");
    });

    it("accepts a user context verified by common auth middleware", () => {
        const req = { auth: { userId: 1 } };
        const res = {};
        let nextCalled = false;

        requireOutfitAuth(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
    });
});

describe("BE4 outfit service", () => {
    it("completes a queued job deterministically when polling", async () => {
        const createdJob = await createGenerationJob(1, {
            bodyProfileId: 1,
            closetItemIds: [3, 7, 12],
            styleTagIds: [1, 3]
        });

        assert.equal(createdJob.status, "queued");

        const polledJob = await getGenerationJob(1, createdJob.jobId);

        assert.equal(polledJob.status, "completed");
        assert.ok(polledJob.outfitResultId);
        assert.ok(polledJob.generatedImage.imageUrl);
    });

    it("rejects access to another user's job", async () => {
        await assert.rejects(
            () => getGenerationJob(2, 1),
            (error) => error.code === "FORBIDDEN403"
        );
    });

    it("rejects closet items owned by another user", async () => {
        await assert.rejects(
            () => createGenerationJob(1, {
                bodyProfileId: 1,
                closetItemIds: [20],
                styleTagIds: [1]
            }),
            (error) => error.code === "FORBIDDEN403"
        );
    });

    it("validates pagination values", async () => {
        await assert.rejects(
            () => getSavedOutfits(1, { page: "abc", size: 10 }),
            (error) => error.code === "REQUEST400"
        );

        await assert.rejects(
            () => getSavedOutfits(1, { page: 1, size: 100 }),
            (error) => error.code === "REQUEST400"
        );
    });

    it("checks saved outfit ownership before delete", async () => {
        await assert.rejects(
            () => deleteSavedOutfit(2, 1),
            (error) => error.code === "FORBIDDEN403"
        );
    });

    it("saves only an owned generated outfit result", async () => {
        const createdJob = await createGenerationJob(1, {
            bodyProfileId: 1,
            closetItemIds: [3],
            styleTagIds: [1]
        });
        const completedJob = await getGenerationJob(1, createdJob.jobId);
        const savedOutfit = await saveOutfit(1, {
            outfitResultId: completedJob.outfitResultId,
            name: "test outfit"
        });

        assert.equal(savedOutfit.name, "test outfit");
        assert.equal(savedOutfit.outfitResultId, completedJob.outfitResultId);
        assert.equal(savedOutfit.id, savedOutfit.savedOutfitId);
        assert.equal(savedOutfit.isSaved, true);
        assert.ok(savedOutfit.createdAt);
        assert.ok(Array.isArray(savedOutfit.items));
        assert.ok(Array.isArray(savedOutfit.styleTags));
    });
});
