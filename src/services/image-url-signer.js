import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 60 * 60;

const problem = (status, code, message) => Object.assign(new Error(message), { status, code });

const requireSecret = (secret) => {
    if (typeof secret !== 'string' || secret.length < 32) {
        throw problem(503, 'IMAGE5036', '이미지 URL 서명 설정이 올바르지 않습니다.');
    }
    return secret;
};

export class ImageUrlSigner {
    constructor({
        secret = process.env.IMAGE_URL_SIGNING_SECRET || process.env.JWT_ACCESS_SECRET,
        ttlSeconds = Number(process.env.IMAGE_URL_TTL_SECONDS) || DEFAULT_TTL_SECONDS,
        now = () => Date.now()
    } = {}) {
        this.secret = secret;
        this.ttlSeconds = Math.min(Math.max(Number(ttlSeconds) || DEFAULT_TTL_SECONDS, 1), MAX_TTL_SECONDS);
        this.now = now;
    }

    signature(imageId, expires) {
        return createHmac('sha256', requireSecret(this.secret))
            .update(`${imageId}.${expires}`)
            .digest('hex');
    }

    createSignedUrl(imageId) {
        const expires = Math.floor(this.now() / 1000) + this.ttlSeconds;
        const signature = this.signature(imageId, expires);
        return `/api/v1/images/${imageId}/content?expires=${expires}&signature=${signature}`;
    }

    verify({ imageId, expires, signature }) {
        const parsedExpires = Number(expires);
        if (!Number.isSafeInteger(parsedExpires) || parsedExpires <= Math.floor(this.now() / 1000)) {
            return false;
        }
        if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) {
            return false;
        }
        const expected = Buffer.from(this.signature(imageId, parsedExpires), 'hex');
        const provided = Buffer.from(signature, 'hex');
        return expected.length === provided.length && timingSafeEqual(expected, provided);
    }
}
