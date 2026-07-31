const itemIdOf = (value) => {
    const itemId = Number(value);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
        throw Object.assign(new Error('유효한 아이템 ID가 필요합니다.'), { status: 400, code: 'CLOSET4006' });
    }
    return itemId;
};

const userIdOf = (req) => req.auth.userId;
const send = (res, status, message, result) => res.status(status).json({ isSuccess: true, code: status === 201 ? 'COMMON201' : 'COMMON200', message, result });

export const createClosetController = (closetService) => ({
    requestSync: async (req, res, next) => {
        try { return send(res, 200, '쇼핑몰 연동 요청을 저장했습니다.', await closetService.requestSync(userIdOf(req), { platform: req.body.platform, isAgreed: req.body.is_agreed })); }
        catch (error) { return next(error); }
    },
    registerItem: async (req, res, next) => {
        try { return send(res, 201, '옷장 아이템 등록에 성공했습니다.', await closetService.registerItem(userIdOf(req), req.body)); }
        catch (error) { return next(error); }
    },
    getItems: async (req, res, next) => {
        try { return send(res, 200, '옷장 아이템 목록 조회에 성공했습니다.', await closetService.listItems(userIdOf(req), req.query)); }
        catch (error) { return next(error); }
    },
    getItem: async (req, res, next) => {
        try { return send(res, 200, '옷장 아이템 상세 조회에 성공했습니다.', await closetService.getItem(userIdOf(req), itemIdOf(req.params.itemId))); }
        catch (error) { return next(error); }
    },
    updateItem: async (req, res, next) => {
        try { return send(res, 200, '옷장 아이템 수정에 성공했습니다.', await closetService.updateItem(userIdOf(req), itemIdOf(req.params.itemId), req.body)); }
        catch (error) { return next(error); }
    },
    deleteItem: async (req, res, next) => {
        try { await closetService.deleteItem(userIdOf(req), itemIdOf(req.params.itemId)); return send(res, 200, '옷장 아이템 삭제에 성공했습니다.', null); }
        catch (error) { return next(error); }
    },
    restoreItem: async (req, res, next) => {
        try { return send(res, 200, '옷장 아이템 복구에 성공했습니다.', await closetService.restoreItem(userIdOf(req), itemIdOf(req.params.itemId))); }
        catch (error) { return next(error); }
    },
    permanentDeleteItem: async (req, res, next) => {
        try { await closetService.permanentDelete(userIdOf(req), itemIdOf(req.params.itemId)); return send(res, 200, '옷장 아이템을 영구 삭제했습니다.', null); }
        catch (error) { return next(error); }
    }
});
