import jwt from 'jsonwebtoken';

export const createAuthError = () => {
    const error = new Error('인증이 필요합니다.');
    error.status = 401;
    error.code = 'AUTH401_01';
    return error;
};

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET;

export const authenticateJwt = (req, res, next) => {
    const authorization = req.get('authorization');
    const match = /^Bearer\s+(.+)$/i.exec(authorization || '');
    const secret = getAccessSecret();

    if (!match || !secret || secret.length < 32) {
        return next(createAuthError());
    }

    try {
        const payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
        const userId = Number(payload.sub);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return next(createAuthError());
        }

        req.auth = { userId };
        return next();
    } catch {
        return next(createAuthError());
    }
};

export const requireAuthContext = (req, res, next) => {
    const userId = req.auth?.userId;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return next(createAuthError());
    }

    return next();
};
