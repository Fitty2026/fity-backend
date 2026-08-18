import assert from 'node:assert/strict';
import { getPrisma, disconnectPrisma } from '../src/config/prisma.js';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const runId = `${process.env.APP_VERSION || 'local'}-${Date.now()}`.replace(/[^a-zA-Z0-9]/g, '').slice(-24);
const email = `smoke-${runId}@fitty.invalid`;
const loginId = `smoke${runId}`.toLowerCase().slice(0, 20);
const password = `Fitty-${runId}-test`;

const request = async (pathname, options = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const body = await response.json().catch(() => null);
    assert.ok(response.ok, `${options.method || 'GET'} ${pathname} failed: ${response.status} ${JSON.stringify(body)}`);
    assert.equal(body?.isSuccess, true, `${pathname} did not return a successful Fitty response`);
    return body.result;
};

const json = (method, body, token) => ({
    method,
    headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
});

await request('/api/v1/auth/signup', json('POST', {
    name: 'Staging Smoke',
    loginId,
    email,
    password
}));

const login = await request('/api/v1/auth/login', json('POST', { email, password }));
assert.match(login.accessToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
const token = login.accessToken;
const tokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const smokeUserId = Number(tokenPayload.sub);
assert.ok(Number.isSafeInteger(smokeUserId) && smokeUserId > 0, 'smoke JWT subject is invalid');

const initialPuzzleBalance = Number(process.env.INITIAL_PUZZLE_BALANCE || 100);
const generationPuzzleCost = Number(process.env.OUTFIT_GENERATION_PUZZLE_COST || 10);
const balanceBeforeGeneration = await request('/api/v1/puzzles/balance', {
    headers: { authorization: `Bearer ${token}` }
});
assert.equal(balanceBeforeGeneration.balance, initialPuzzleBalance, 'signup puzzle grant is incorrect');

await request('/api/v1/closets/items', {
    headers: { authorization: `Bearer ${token}` }
});

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X62Q6wAAAABJRU5ErkJggg==',
    'base64'
);
const form = new FormData();
form.set('imageType', 'CLOSET_ITEM');
form.set('image', new Blob([png], { type: 'image/png' }), 'smoke.png');
const uploaded = await request('/api/v1/images/upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form
});
assert.ok(Number.isSafeInteger(uploaded.imageId));

const closetItem = await request('/api/v1/closets/items', json('POST', {
    imageId: uploaded.imageId,
    name: 'Smoke item',
    size: 'FREE',
    category: 'TOP',
    importType: 'MANUAL',
    tags: ['smoke']
}, token));
assert.ok(Number.isSafeInteger(closetItem.item_id));

await request('/api/v1/users/onboarding/style', json('POST', {
    styleTagIds: [1]
}, token));

await request('/api/v1/body-profiles/type', json('POST', {
    bodyType: 'STRAIGHT'
}, token));

await getPrisma().bodyProfile.upsert({
    where: { userId: smokeUserId },
    create: {
        userId: smokeUserId,
        bodyType: 'STRAIGHT',
        bodyBalance: 'BALANCED',
        shoulderWidth: 'AVERAGE',
        frameSize: 'MEDIUM'
    },
    update: {
        bodyType: 'STRAIGHT',
        bodyBalance: 'BALANCED',
        shoulderWidth: 'AVERAGE',
        frameSize: 'MEDIUM'
    }
});

const generation = await request('/api/v1/outfits/generation-jobs', json('POST', {
    closetItemIds: [closetItem.item_id],
    styleTagIds: [1]
}, token));
assert.ok(Number.isSafeInteger(generation.jobId));

let completed;
for (let attempt = 0; attempt < 30; attempt += 1) {
    const job = await request(`/api/v1/outfits/generation-jobs/${generation.jobId}`, {
        headers: { authorization: `Bearer ${token}` }
    });
    if (job.status === 'completed') {
        completed = job;
        break;
    }
    if (job.status === 'failed') {
        assert.fail(`outfit generation failed: ${JSON.stringify(job.failure)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
}

assert.ok(completed, 'outfit generation did not complete within 15 seconds');
assert.equal(completed.generatedImage?.fallbackUsed, true, 'staging fallback path was not used');
const balanceAfterGeneration = await request('/api/v1/puzzles/balance', {
    headers: { authorization: `Bearer ${token}` }
});
assert.equal(
    balanceAfterGeneration.balance,
    initialPuzzleBalance - generationPuzzleCost,
    'outfit generation puzzle debit is incorrect'
);

await request(`/api/v1/closets/items/${closetItem.item_id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` }
});
await request(`/api/v1/images/${uploaded.imageId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` }
});

await disconnectPrisma();
console.log(`Fitty staging smoke passed: ${process.env.APP_VERSION || 'local'}`);
