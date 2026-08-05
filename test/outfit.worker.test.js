import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OutfitWorker } from '../src/workers/outfit.worker.js';

describe('OutfitWorker', () => {
    it('polls queued jobs and prevents overlapping ticks', async () => {
        let calls = 0;
        let release;
        const blocked = new Promise((resolve) => { release = resolve; });
        const worker = new OutfitWorker({
            service: { processPendingJobs: async (batchSize) => { calls += 1; assert.equal(batchSize, 3); await blocked; } },
            batchSize: 3,
            intervalMs: 1000,
            logger: { error: () => {} }
        });

        const first = worker.tick();
        await worker.tick();
        assert.equal(calls, 1);
        release();
        await first;
        await worker.tick();
        assert.equal(calls, 2);
    });

    it('logs polling errors and remains available for the next tick', async () => {
        const errors = [];
        let calls = 0;
        const worker = new OutfitWorker({
            service: { processPendingJobs: async () => { calls += 1; if (calls === 1) throw new Error('database unavailable'); } },
            logger: { error: (...args) => errors.push(args) }
        });

        await worker.tick();
        await worker.tick();
        assert.equal(errors.length, 1);
        assert.equal(calls, 2);
    });

    it('runs expiration cleanup on its own interval without blocking job polling after cleanup errors', async () => {
        let timestamp = 1000;
        let cleanupCalls = 0;
        let pollingCalls = 0;
        const errors = [];
        const worker = new OutfitWorker({
            service: {
                cleanupExpiredJobs: async () => { cleanupCalls += 1; if (cleanupCalls === 2) throw new Error('cleanup failed'); },
                processPendingJobs: async () => { pollingCalls += 1; }
            },
            cleanupIntervalMs: 60000,
            now: () => timestamp,
            logger: { error: (...args) => errors.push(args) }
        });

        await worker.tick();
        timestamp += 1000;
        await worker.tick();
        timestamp += 60000;
        await worker.tick();

        assert.equal(cleanupCalls, 2);
        assert.equal(pollingCalls, 3);
        assert.equal(errors.length, 1);
    });
});
