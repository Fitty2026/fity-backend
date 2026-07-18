import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import outfitRouter from "../src/routes/outfit.routes.js";
import { errorHandler } from "../src/middlewares/response.middleware.js";
import { resetOutfitStoreForTest } from "../src/services/outfit.service.js";

let server;
let baseUrl;

before(async () => {
    const app = express();

    app.use(express.json());
    app.use((req, res, next) => {
        const userId = Number(req.get("x-test-user-id"));

        if (Number.isSafeInteger(userId) && userId > 0) {
            req.auth = { userId };
        }

        next();
    });
    app.use("/api/v1/outfits", outfitRouter);
    app.use(errorHandler);

    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const { port } = server.address();
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
});

beforeEach(() => {
    resetOutfitStoreForTest();
});

describe("BE4 outfit HTTP routes", () => {
    it("rejects requests without common auth context", async () => {
        const response = await fetch(`${baseUrl}/api/v1/outfits/saved`);
        const body = await response.json();

        assert.equal(response.status, 401);
        assert.equal(body.code, "AUTH401");
    });

    it("creates and polls an outfit generation job with verified auth context", async () => {
        const createResponse = await fetch(`${baseUrl}/api/v1/outfits/generation-jobs`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-test-user-id": "1"
            },
            body: JSON.stringify({
                bodyProfileId: 1,
                closetItemIds: [3, 7],
                styleTagIds: [1]
            })
        });
        const createBody = await createResponse.json();

        assert.equal(createResponse.status, 200);
        assert.equal(createBody.result.status, "queued");

        const pollResponse = await fetch(`${baseUrl}/api/v1/outfits/generation-jobs/${createBody.result.jobId}`, {
            headers: {
                "x-test-user-id": "1"
            }
        });
        const pollBody = await pollResponse.json();

        assert.equal(pollResponse.status, 200);
        assert.equal(pollBody.result.status, "completed");
        assert.ok(pollBody.result.generatedImage.imageUrl);
    });

    it("returns saved outfit fields consumed by the frontend", async () => {
        const response = await fetch(`${baseUrl}/api/v1/outfits/saved?page=1&size=10`, {
            headers: {
                "x-test-user-id": "1"
            }
        });
        const body = await response.json();
        const [savedOutfit] = body.result.items;

        assert.equal(response.status, 200);
        assert.equal(savedOutfit.id, savedOutfit.savedOutfitId);
        assert.ok(Array.isArray(savedOutfit.items));
        assert.ok(Array.isArray(savedOutfit.styleTags));
        assert.ok(savedOutfit.createdAt);
        assert.equal(savedOutfit.isSaved, true);
    });
});
