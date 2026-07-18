export const requireOutfitAuth = (req, res, next) => {
    if (req.auth?.userId) {
        return next();
    }

    const authorization = req.get("authorization") || "";
    const matchedUserId = authorization.match(/^Bearer test-user-(\d+)$/)?.[1];
    const userId = Number(matchedUserId);

    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(401).json({
            isSuccess: false,
            code: "AUTH401",
            message: "Authentication is required.",
            result: null
        });
    }

    req.auth = { userId };
    return next();
};
