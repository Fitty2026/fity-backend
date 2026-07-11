const { fetchClosetList, saveImportType, updateItemTags } = require('../services/closet.service.js');
//SCR-CLO-001
exports.postImportType = (req, res) => {
    const { closet_import_type } = req.body;
    const resultData = saveImportType(closet_import_type);
    return res.status(200).json({
        isSuccess: true,
        code: "COMMON200",
        message: "옷장등록방식저장성공",
        result:resultData
    });
};

//SCR-CLO-004
exports.patchItemTags = (req, res) => {
    const { itemId } = req.params;
    const { tag_values } = req.body;
    const resultData = updateItemTags(itemId, tag_values);
    return res.status(200).json({
        isSuccess: true,
        code: "COMMON200",
        message: "태그 수정 완료",
        result: resultData
    });
};

//SCR-CLO-005
exports.getClosetList = (req, res) => {
    const {filter, sort, search} = req.query;
    const resultData = fetchClosetList(filter, sort, search);
    return res.status(200).json({
        isSuccess: true,
        code: "COMMON200",
        message:"옷장 목록 조회 성공",
        result: resultData
    });
};