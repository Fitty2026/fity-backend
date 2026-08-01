import assert from 'node:assert/strict';

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

await request(`/api/v1/closets/items/${closetItem.item_id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` }
});
await request(`/api/v1/images/${uploaded.imageId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` }
});

console.log(`Fitty staging smoke passed: ${process.env.APP_VERSION || 'local'}`);
