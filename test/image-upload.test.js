import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

let request;
let app;

const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
]);

before(async () => {
    ({ default: request } = await import('supertest'));
    ({ default: app } = await import('../src/app.js'));
});

describe('POST /api/v1/images/upload', () => {
    it('receives a supported image and returns the common response shape', async () => {
        const response = await request(app)
            .post('/api/v1/images/upload')
            .field('imageType', 'BODY_PROFILE')
            .attach('image', PNG_SIGNATURE, {
                filename: 'body.png',
                contentType: 'image/png'
            });

        assert.equal(response.status, 200);
        assert.equal(response.body.isSuccess, true);
        assert.equal(response.body.code, 'COMMON200');
        assert.equal(response.body.result.imageType, 'BODY_PROFILE');
        assert.equal(response.body.result.originalName, 'body.png');
        assert.equal(response.body.result.uploadStatus, 'RECEIVED');
        assert.equal(typeof response.body.result.imageId, 'number');
    });

    it('rejects a request without an image', async () => {
        const response = await request(app)
            .post('/api/v1/images/upload')
            .field('imageType', 'PROFILE');

        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'IMAGE4001');
    });

    it('rejects an unsupported image type', async () => {
        const response = await request(app)
            .post('/api/v1/images/upload')
            .field('imageType', 'OUTFIT_RESULT')
            .attach('image', PNG_SIGNATURE, {
                filename: 'outfit.png',
                contentType: 'image/png'
            });

        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'IMAGE4002');
    });

    it('rejects non-image files', async () => {
        const response = await request(app)
            .post('/api/v1/images/upload')
            .field('imageType', 'CLOSET_ITEM')
            .attach('image', Buffer.from('plain-text'), {
                filename: 'notes.txt',
                contentType: 'text/plain'
            });

        assert.equal(response.status, 415);
        assert.equal(response.body.code, 'IMAGE4151');
    });

    it('rejects a file whose bytes do not match its declared image type', async () => {
        const response = await request(app)
            .post('/api/v1/images/upload')
            .field('imageType', 'PROFILE')
            .attach('image', Buffer.from('not-an-image'), {
                filename: 'spoofed.png',
                contentType: 'image/png'
            });

        assert.equal(response.status, 415);
        assert.equal(response.body.code, 'IMAGE4151');
    });

    it('rejects images larger than 10MB', async () => {
        const oversizedImage = Buffer.concat([
            PNG_SIGNATURE,
            Buffer.alloc(10 * 1024 * 1024)
        ]);
        const response = await request(app)
            .post('/api/v1/images/upload')
            .field('imageType', 'BODY_PROFILE')
            .attach('image', oversizedImage, {
                filename: 'large.png',
                contentType: 'image/png'
            });

        assert.equal(response.status, 413);
        assert.equal(response.body.code, 'IMAGE4131');
    });

    it('normalizes duplicate fields as an invalid multipart request', async () => {
        const response = await request(app)
            .post('/api/v1/images/upload')
            .field('imageType', 'PROFILE')
            .field('imageType', 'BODY_PROFILE')
            .attach('image', PNG_SIGNATURE, {
                filename: 'body.png',
                contentType: 'image/png'
            });

        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'IMAGE4003');
    });

    it('rejects non-multipart requests with the documented error', async () => {
        const response = await request(app)
            .post('/api/v1/images/upload')
            .send({ imageType: 'PROFILE' });

        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'IMAGE4003');
    });

    it('does not expose parser errors from malformed multipart bodies', async () => {
        const response = await request(app)
            .post('/api/v1/images/upload')
            .set('Content-Type', 'multipart/form-data; boundary=broken')
            .send('--broken\r\nContent-Disposition: form-data; name="imageType"\r\n\r\nPROFILE');

        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'IMAGE4003');
        assert.equal(response.body.message, '이미지 업로드 요청 형식이 올바르지 않습니다.');
    });
});
