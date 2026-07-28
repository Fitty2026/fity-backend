import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCorsOptions } from '../src/app.js';

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
