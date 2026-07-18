export const requireOutfitAuth = (req, res, next) => {
    if (Number.isSafeInteger(req.auth?.userId) && req.auth.userId > 0) {
        return next();
    }

    return res.status(401).json({
        isSuccess: false,
        code: "AUTH401",
        message: "Authentication is required.",
        result: null
    });
};
