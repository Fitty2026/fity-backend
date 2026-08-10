import jwt from 'jsonwebtoken';

export const createAuthError = (code, message) => {
    const error = new Error(message);
    error.status = 401;
    error.code = code;
    return error;
};

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET;

export const authenticateJwt = (req, res, next) => {
    const authorization = req.get('authorization');
    const match = /^Bearer\s+(.+)$/i.exec(authorization || '');
    const secret = getAccessSecret();

    if (!authorization || !match) {
        return next(createAuthError('AUTH401_01', '인증 토큰이 누락되었습니다.'));
    }

    if (!secret || secret.length < 32) {
        return next(createAuthError('AUTH401_03', '유효하지 않은 인증 토큰입니다.'));
    }

    try {
        const payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
        const userId = Number(payload.sub);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return next(createAuthError('AUTH401_03', '유효하지 않은 인증 토큰입니다.'));
        }

        req.auth = { userId };
        return next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return next(createAuthError('AUTH401_02', '만료된 토큰입니다. 다시 로그인해주세요.'));
        }
        return next(createAuthError('AUTH401_03', '유효하지 않은 인증 토큰입니다.'));
    }
};

export const requireAuthContext = (req, res, next) => {
    const userId = req.auth?.userId;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return next(createAuthError('AUTH401_01', '인증 토큰이 누락되었습니다.'));
    }

    return next();
};
