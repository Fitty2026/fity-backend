import { requestSyncService, requestItemRegistration, requestItemList, requestItemDetail, requestItemUpdate, requestItemDelete } from '../services/closet.service.js'

//CLOSET-01 쇼핑몰연동
export const requestSync = async (req, res) => {
    try {
        const { platform, is_agreed } = req.body;
        const userId = req.user?.id || 1; //임시 유저 아이디 1로 설정해둠

        if (!platform) return res.status(400).json({ isSuccess: false, code: "REQUEST400", message: "연동할 플랫폼 정보가 필요합니다." });
        if (!is_agreed) return res.status(400).json({ isSuccess: false, code: "REQUEST400", message: "구매내역 조회 권한 동의가 필요합니다." });

        const result = await requestSyncService(userId, platform, is_agreed);

        return res.status(200).json({
            isSuccess: true,
            code: "COMMON200",
            message: "쇼핑몰 데이터 연동 시작",
            result
        });

    } catch (error) {
        console.error("쇼핑몰 연동 controller 에러:", error);
        return res.status(500).json({ isSuccess: false, code: "SERVER500", message: "서버 내부 에러가 발생했습니다." });
    }
};

//CLOSET-02 아이템 등록
export const registerItem = async (req, res) => {
    try {
        const { userId, category, importType, imageUrl, name, size } = req.body;

        const result = await requestItemRegistration(
            userId, category, importType, imageUrl, name, size
        );

        res.status(200).json({
            isSuccess: true,
            code: "COMMON200",
            message: "옷장 아이템 등록에 성공했습니다.",
            result: result
        });
    } catch (error) {
        console.error("아이템 등록 컨트롤러 에러:", error);
        res.status(500).json({
            isSuccess: false,
            code: "SERVER500",
            message: "서버 내부 에러가 발생했습니다."
        });
    }
};

//CLOSET-03 아이템 조회
export const getItems = async (req, res) => {
    try {
        const userId = parseInt(req.query.userId, 10);
        const category = req.query.category; 
        const keyword = req.query.keyword;

        if (!userId) {
            return res.status(400).json({ isSuccess: false, code: "BAD400", message: "userId가 필요합니다." });
        }

        const result = await requestItemList(userId, category, keyword);

        res.status(200).json({
            isSuccess: true,
            code: "COMMON200",
            message: "옷장 아이템 목록 조회에 성공했습니다.",
            result: result
        });
    } catch (error) {
        console.error("아이템 목록 조회 컨트롤러 에러:", error);
        res.status(500).json({ isSuccess: false, code: "SERVER500", message: "서버 내부 에러" });
    }
};

//CLOSET-04 아이템 상세조회
export const getItemDetail = async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId, 10);

        if (!itemId) {
            return res.status(400).json({ isSuccess: false, code: "BAD400", message: "아이템 ID가 필요합니다." });
        }

        const result = await requestItemDetail(userId, itemId);

        res.status(200).json({
            isSuccess: true,
            code: "COMMON200",
            message: "옷장 아이템 상세 조회에 성공했습니다.",
            result: result
        });
    } catch (error) {
        if (error.message === 'ITEM_NOT_FOUND') {
            return res.status(404).json({ isSuccess: false, code: "NOT404", message: "존재하지 않는 아이템입니다." });
        }
        if (error.message === 'FORBIDDEN_NOT_YOUR_ITEM') {
            return res.status(403).json({ isSuccess: false, code: "FORBIDDEN403", message: "해당 아이템에 접근할 권한이 없습니다." });
        }
        console.error("아이템 상세 조회 컨트롤러 에러:", error);
        res.status(500).json({ isSuccess: false, code: "SERVER500", message: "서버 에러" });
    }
};

//CLOSET-05 아이템 정보, 태그 수정
export const updateItem = async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId, 10);
        const { name, size, category, importType, tags } = req.body;

        if (!itemId) {
            return res.status(400).json({ isSuccess: false, code: "BAD400", message: "수정할 아이템 ID가 필요합니다." });
        }

        const result = await requestItemUpdate(itemId, name, size, category, importType, tags);

        res.status(200).json({
            isSuccess: true,
            code: "COMMON200",
            message: "옷장 아이템 수정에 성공했습니다.",
            result: result
        });
    } catch (error) {
        //존재하지 않는 아이디 수정하려고하면 에러 주는 코드
        if (error.code === 'P2025') {
            return res.status(404).json({ isSuccess: false, code: "NOT404", message: "존재하지 않는 아이템입니다." });
        }
        console.error("아이템 수정 컨트롤러 에러:", error);
        res.status(500).json({ isSuccess: false, code: "SERVER500", message: "서버 에러" });
    }
};

//CLOSET-06
export const deleteItem = async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId, 10);

        if (!itemId) {
            return res.status(400).json({ isSuccess: false, code: "BAD400", message: "삭제할 아이템 ID가 필요합니다." });
        }
        await requestItemDelete(itemId);

        res.status(200).json({
            isSuccess: true,
            code: "COMMON200",
            message: "옷장 아이템 삭제에 성공했습니다.",
            result: null
        });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ isSuccess: false, code: "NOT404", message: "존재하지 않는 아이템이거나 이미 삭제되었습니다." });
        }
        console.error("아이템 삭제 컨트롤러 에러:", error);
        res.status(500).json({ isSuccess: false, code: "SERVER500", message: "서버 에러" });
    }
};