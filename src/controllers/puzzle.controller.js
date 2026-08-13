import { sendResponse } from '../middlewares/response.middleware.js';

export const getBalance = async (req, res, next) => {
    try {
        return sendResponse(res, await req.app.locals.puzzleService.getBalance(req.auth.userId));
    } catch (error) {
        return next(error);
    }
};
