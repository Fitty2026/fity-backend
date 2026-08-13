import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { requireAuthContext } from '../src/middlewares/auth-context.middleware.js';
import { ImageService } from '../src/services/image.service.js';
import { ImageUrlSigner } from '../src/services/image-url-signer.js';
import { MemoryImageRepository } from './helpers/memory-image.repository.js';
import { MemoryImageStorage } from './helpers/memory-image.storage.js';

let request;
let app;
let repository;
let storage;
let imageService;
let imageUrlSigner;

let PNG_IMAGE;
const TRUNCATED_PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
]);

const authenticateForTest = (req, res, next) => {
    const userId = Number(req.get('x-test-user-id'));
    if (Number.isSafeInteger(userId) && userId > 0) {
        req.auth = { userId };
    }
    return requireAuthContext(req, res, next);
};

const authenticated = (builder, userId = 1) => builder.set('x-test-user-id', String(userId));

const uploadPng = (userId = 1, imageType = 'BODY_PROFILE') => authenticated(
    request(app)
        .post('/api/v1/images/upload')
        .field('imageType', imageType)
        .attach('image', PNG_IMAGE, {
            filename: 'body.png',
            contentType: 'image/png'
        }),
    userId
);

before(async () => {
    ({ default: request } = await import('supertest'));
    PNG_IMAGE = await sharp({
        create: {
            width: 1,
            height: 1,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
    }).png().toBuffer();
});

beforeEach(() => {
    repository = new MemoryImageRepository();
    storage = new MemoryImageStorage();
    imageUrlSigner = new ImageUrlSigner({
        secret: 'test-image-url-secret-at-least-32-characters'
    });
    imageService = new ImageService({
        repository,
        storage,
        urlSigner: imageUrlSigner,
        storageProvider: 'memory'
    });
    app = createApp({
        imageService,
        authenticate: authenticateForTest,
        healthCheck: async () => {}
    });
});

describe('BE2 image asset API', () => {
    it('rejects requests without an authenticated user context', async () => {
        const response = await request(app).post('/api/v1/images/upload');

        assert.equal(response.status, 401);
        assert.equal(response.body.code, 'AUTH401_01');
    });

    it('stores a supported image and returns a protected content URL', async () => {
        const response = await uploadPng();

        assert.equal(response.status, 200);
        assert.equal(response.body.isSuccess, true);
        assert.equal(response.body.result.imageType, 'BODY_PROFILE');
        assert.equal(response.body.result.originalName, 'body.png');
        assert.equal(response.body.result.uploadStatus, 'ACTIVE');
        assert.match(response.body.result.imageUrl, /^\/api\/v1\/images\/\d+\/content$/);
        assert.equal(await storage.exists(repository.records.get(1).storageKey), true);
    });

    it('rejects a request without an image', async () => {
        const response = await authenticated(
            request(app).post('/api/v1/images/upload').field('imageType', 'PROFILE')
        );

        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'IMAGE4001');
    });

    it('rejects unsupported and internal-only image types', async () => {
        for (const imageType of ['UNKNOWN', 'OUTFIT_RESULT']) {
            const response = await uploadPng(1, imageType);
            assert.equal(response.status, 400);
            assert.equal(response.body.code, 'IMAGE4002');
        }
    });

    it('rejects a request without an image type', async () => {
        const response = await authenticated(
            request(app)
                .post('/api/v1/images/upload')
                .attach('image', PNG_IMAGE, {
                    filename: 'profile.png',
                    contentType: 'image/png'
                })
        );

        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'IMAGE4002');
    });

    it('normalizes a supported image type', async () => {
        const response = await uploadPng(1, ' body_profile ');

        assert.equal(response.status, 200);
        assert.equal(response.body.result.imageType, 'BODY_PROFILE');
    });

    it('rejects non-image files and spoofed MIME types', async () => {
        const nonImage = await authenticated(
            request(app)
                .post('/api/v1/images/upload')
                .field('imageType', 'CLOSET_ITEM')
                .attach('image', Buffer.from('plain-text'), {
                    filename: 'notes.txt',
                    contentType: 'text/plain'
                })
        );
        assert.equal(nonImage.status, 415);
        assert.equal(nonImage.body.code, 'IMAGE4151');

        const spoofed = await authenticated(
            request(app)
                .post('/api/v1/images/upload')
                .field('imageType', 'PROFILE')
                .attach('image', TRUNCATED_PNG, {
                    filename: 'spoofed.png',
                    contentType: 'image/png'
                })
        );
        assert.equal(spoofed.status, 415);
        assert.equal(spoofed.body.code, 'IMAGE4151');
    });

    it('rejects images larger than 10MB', async () => {
        const oversizedImage = Buffer.concat([
            PNG_IMAGE,
            Buffer.alloc(10 * 1024 * 1024)
        ]);
        const response = await authenticated(
            request(app)
                .post('/api/v1/images/upload')
                .field('imageType', 'BODY_PROFILE')
                .attach('image', oversizedImage, {
                    filename: 'large.png',
                    contentType: 'image/png'
                })
        );

        assert.equal(response.status, 413);
        assert.equal(response.body.code, 'IMAGE4131');
    });

    it('normalizes duplicate fields and malformed bodies to safe errors', async () => {
        const duplicate = await authenticated(
            request(app)
                .post('/api/v1/images/upload')
                .field('imageType', 'PROFILE')
                .field('imageType', 'BODY_PROFILE')
                .attach('image', PNG_IMAGE, {
                    filename: 'body.png',
                    contentType: 'image/png'
                })
        );
        assert.equal(duplicate.status, 400);
        assert.equal(duplicate.body.code, 'IMAGE4003');

        const nonMultipart = await authenticated(
            request(app).post('/api/v1/images/upload').send({ imageType: 'PROFILE' })
        );
        assert.equal(nonMultipart.status, 400);
        assert.equal(nonMultipart.body.code, 'IMAGE4003');

        const malformed = await authenticated(
            request(app)
                .post('/api/v1/images/upload')
                .set('Content-Type', 'multipart/form-data; boundary=broken')
                .send('--broken\r\nContent-Disposition: form-data; name="imageType"\r\n\r\nPROFILE')
        );
        assert.equal(malformed.status, 400);
        assert.equal(malformed.body.code, 'IMAGE4003');
        assert.equal(malformed.body.message, '이미지 업로드 요청 형식이 올바르지 않습니다.');
    });

    it('allows only the owner to read metadata and content', async () => {
        const uploaded = await uploadPng(7);
        const imageId = uploaded.body.result.imageId;

        const metadata = await authenticated(request(app).get(`/api/v1/images/${imageId}`), 7);
        assert.equal(metadata.status, 200);
        assert.equal(metadata.body.result.imageId, imageId);

        const content = await authenticated(request(app).get(`/api/v1/images/${imageId}/content`), 7);
        assert.equal(content.status, 200);
        assert.equal(content.headers['cache-control'], 'private, no-store');
        assert.equal(content.headers['x-content-type-options'], 'nosniff');
        assert.deepEqual(content.body, PNG_IMAGE);

        const otherUser = await authenticated(request(app).get(`/api/v1/images/${imageId}`), 8);
        assert.equal(otherUser.status, 404);
        assert.equal(otherUser.body.code, 'IMAGE4041');
    });

    it('serves a valid short-lived signed URL without Authorization', async () => {
        const uploaded = await uploadPng(7, 'CLOSET_ITEM');
        const imageId = uploaded.body.result.imageId;
        const signedUrl = imageUrlSigner.createSignedUrl(imageId);

        const content = await request(app).get(signedUrl);
        assert.equal(content.status, 200);
        assert.equal(content.headers['x-content-type-options'], 'nosniff');
        assert.deepEqual(content.body, PNG_IMAGE);

        const tampered = await request(app).get(signedUrl.replace(`/${imageId}/`, `/${imageId + 1}/`));
        assert.equal(tampered.status, 403);
        assert.equal(tampered.body.code, 'IMAGE4031');
    });

    it('rejects an expired signed URL', async () => {
        const uploaded = await uploadPng(7, 'CLOSET_ITEM');
        const imageId = uploaded.body.result.imageId;
        const expiredSigner = new ImageUrlSigner({
            secret: 'test-image-url-secret-at-least-32-characters',
            ttlSeconds: 1,
            now: () => 1_000
        });
        const expiredUrl = expiredSigner.createSignedUrl(imageId);

        const response = await request(app).get(expiredUrl);
        assert.equal(response.status, 403);
        assert.equal(response.body.code, 'IMAGE4031');
    });

    it('deletes the file and blocks subsequent access', async () => {
        const uploaded = await uploadPng(3);
        const imageId = uploaded.body.result.imageId;
        const storageKey = repository.records.get(imageId).storageKey;

        const removed = await authenticated(request(app).delete(`/api/v1/images/${imageId}`), 3);
        assert.equal(removed.status, 200);
        assert.equal(removed.body.result.status, 'DELETED');
        assert.equal(await storage.exists(storageKey), false);

        const metadata = await authenticated(request(app).get(`/api/v1/images/${imageId}`), 3);
        assert.equal(metadata.status, 404);
    });

    it('keeps failed deletes inaccessible and allows a retry', async () => {
        const uploaded = await uploadPng(4);
        const imageId = uploaded.body.result.imageId;
        const originalDelete = storage.delete.bind(storage);
        storage.delete = async () => { throw new Error('temporary storage outage'); };

        const failed = await authenticated(request(app).delete(`/api/v1/images/${imageId}`), 4);
        assert.equal(failed.status, 503);
        assert.equal(failed.body.code, 'IMAGE5034');
        assert.equal(repository.records.get(imageId).status, 'DELETE_FAILED');

        const hidden = await authenticated(request(app).get(`/api/v1/images/${imageId}`), 4);
        assert.equal(hidden.status, 404);

        storage.delete = originalDelete;
        const retried = await authenticated(request(app).delete(`/api/v1/images/${imageId}`), 4);
        assert.equal(retried.status, 200);
        assert.equal(repository.records.get(imageId).status, 'DELETED');
    });

    it('marks failed uploads and compensates stored files', async () => {
        storage.put = async () => { throw new Error('storage unavailable'); };

        const response = await uploadPng(5);

        assert.equal(response.status, 503);
        assert.equal(response.body.code, 'IMAGE5032');
        assert.equal(repository.records.get(1).status, 'UPLOAD_FAILED');
        assert.equal(storage.files.size, 0);
    });

    it('stores generated and fallback results only through the internal service', async () => {
        const generated = await imageService.createGeneratedImage({
            ownerUserId: 9,
            file: {
                buffer: PNG_IMAGE,
                mimetype: 'image/png',
                originalname: 'result.png',
                size: PNG_IMAGE.length
            }
        });
        const fallback = await imageService.createGeneratedImage({
            ownerUserId: 9,
            fallback: true,
            file: {
                buffer: PNG_IMAGE,
                mimetype: 'image/png',
                originalname: 'fallback.png',
                size: PNG_IMAGE.length
            }
        });

        assert.equal(generated.imageType, 'OUTFIT_RESULT');
        assert.equal(generated.origin, 'GENERATED');
        assert.equal(fallback.origin, 'FALLBACK');
    });

    it('recovers stale upload and delete states', async () => {
        const staleAt = new Date(Date.now() - 60 * 60 * 1000);
        const upload = await repository.createUploading({
            ownerUserId: 11,
            imageType: 'PROFILE',
            origin: 'USER_UPLOAD',
            storageProvider: 'memory',
            storageKey: '11/stale-upload',
            originalFileName: 'stale.png',
            mimeType: 'image/png',
            fileSizeBytes: PNG_IMAGE.length,
            checksumSha256: 'a'.repeat(64),
            updatedAt: staleAt
        });
        await storage.put({ key: upload.storageKey, buffer: PNG_IMAGE });

        const pending = await repository.createUploading({
            ownerUserId: 12,
            imageType: 'PROFILE',
            origin: 'USER_UPLOAD',
            storageProvider: 'memory',
            storageKey: '12/stale-delete',
            originalFileName: 'delete.png',
            mimeType: 'image/png',
            fileSizeBytes: PNG_IMAGE.length,
            checksumSha256: 'b'.repeat(64),
            updatedAt: staleAt
        });
        await repository.markActive({ imageId: pending.id, ownerUserId: 12 });
        await repository.markDeletePending({ imageId: pending.id, ownerUserId: 12 });
        repository.records.get(pending.id).updatedAt = staleAt;
        await storage.put({ key: pending.storageKey, buffer: PNG_IMAGE });

        const results = await imageService.reconcileStaleAssets({ before: new Date() });

        assert.deepEqual(results, [
            { imageId: upload.id, status: 'UPLOAD_FAILED' },
            { imageId: pending.id, status: 'DELETED' }
        ]);
        assert.equal(await storage.exists(upload.storageKey), false);
        assert.equal(await storage.exists(pending.storageKey), false);
    });

    it('returns a generic 500 for unexpected failures', async () => {
        imageService.getImage = async () => { throw new Error('sensitive database detail'); };

        const response = await authenticated(request(app).get('/api/v1/images/1'), 1);

        assert.equal(response.status, 500);
        assert.equal(response.body.code, 'COMMON500');
        assert.equal(response.body.message, '서버 내부 오류가 발생했습니다.');
        assert.doesNotMatch(JSON.stringify(response.body), /sensitive database detail/);
    });

    it('reports the real database health result', async () => {
        const previousAppVersion = process.env.APP_VERSION;
        const previousFrontendCommitSha = process.env.FRONTEND_COMMIT_SHA;
        const expectedBackendCommitSha = 'a'.repeat(40);
        const expectedFrontendCommitSha = 'b'.repeat(40);
        process.env.APP_VERSION = expectedBackendCommitSha;
        process.env.FRONTEND_COMMIT_SHA = expectedFrontendCommitSha;

        try {
            const healthy = await request(app).get('/health');
            assert.equal(healthy.status, 200);
            assert.equal(healthy.body.result.appVersion, expectedBackendCommitSha);
            assert.equal(healthy.body.result.commitSha, expectedBackendCommitSha);
            assert.equal(healthy.body.result.commitShort, expectedBackendCommitSha.slice(0, 7));
            assert.equal(healthy.body.result.backendCommitSha, expectedBackendCommitSha);
            assert.equal(healthy.body.result.backendCommitShort, expectedBackendCommitSha.slice(0, 7));
            assert.equal(healthy.body.result.frontendCommitSha, expectedFrontendCommitSha);
            assert.equal(healthy.body.result.frontendCommitShort, expectedFrontendCommitSha.slice(0, 7));
            assert.equal(healthy.body.result.dbConnection_mysql, 'CONNECTED');
        } finally {
            if (previousAppVersion === undefined) {
                delete process.env.APP_VERSION;
            } else {
                process.env.APP_VERSION = previousAppVersion;
            }
            if (previousFrontendCommitSha === undefined) {
                delete process.env.FRONTEND_COMMIT_SHA;
            } else {
                process.env.FRONTEND_COMMIT_SHA = previousFrontendCommitSha;
            }
        }

        const failingApp = createApp({
            imageService,
            authenticate: authenticateForTest,
            healthCheck: async () => { throw new Error('db down'); }
        });
        const unhealthy = await request(failingApp).get('/health');
        assert.equal(unhealthy.status, 503);
        assert.equal(unhealthy.body.code, 'COMMON503');
    });
});
