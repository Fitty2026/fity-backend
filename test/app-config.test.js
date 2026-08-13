import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp, createCorsOptions } from '../src/app.js';

const evaluateOrigin = (options, origin) => new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => {
        if (error) return reject(error);
        return resolve(allowed);
    });
});

describe('application deployment configuration', () => {
    it('keeps the local default permissive when no CORS allowlist is configured', () => {
        assert.deepEqual(createCorsOptions(''), {});
    });

    it('allows only configured browser origins while preserving non-browser requests', async () => {
        const options = createCorsOptions('http://localhost:5173, https://fitty.gubiko.dev');

        assert.equal(await evaluateOrigin(options, 'http://localhost:5173'), true);
        assert.equal(await evaluateOrigin(options, undefined), true);
        await assert.rejects(
            evaluateOrigin(options, 'https://untrusted.example'),
            /허용되지 않은 CORS origin/
        );
    });
});

describe('application routing', () => {
    it('returns the common JSON error for an unknown API route', async () => {
        const app = createApp({ healthCheck: async () => {} });
        const response = await request(app).get('/api/v1/not-a-real-route');

        assert.equal(response.status, 404);
        assert.deepEqual(response.body, {
            isSuccess: false,
            code: 'NOT_FOUND404',
            message: '요청한 API를 찾을 수 없습니다.',
            result: null
        });
    });
});
