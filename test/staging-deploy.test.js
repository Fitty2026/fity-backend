import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readRepositoryFile = (pathname) => readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');

test('staging smoke does not call the removed body type endpoint', async () => {
    const smoke = await readRepositoryFile('deploy/smoke.mjs');

    assert.doesNotMatch(smoke, /\/api\/v1\/body-profiles\/type/);
});

test('staging passes the Naver receipt OCR configuration to the API container', async () => {
    const compose = await readRepositoryFile('docker-compose.yml');

    assert.match(compose, /NAVER_RECEIPT_OCR_URL:\s*\$\{NAVER_RECEIPT_OCR_URL:-\}/);
    assert.match(compose, /NAVER_OCR_SECRET_KEY:\s*\$\{NAVER_OCR_SECRET_KEY:-\}/);
});
