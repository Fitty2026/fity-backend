const createAuthError = () => {
    const error = new Error('인증이 필요합니다.');
    error.status = 401;
    error.code = 'AUTH4011';
    return error;
};

export const requireAuthContext = (req, res, next) => {
    const userId = req.auth?.userId;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return next(createAuthError());
    }

    return next();
};
