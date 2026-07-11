export const sendResponse = (res, data, message = "요청에 성공하였습니다.") => {
    return res.status(200).json({
        isSuccess: true,
        code: "COMMON200",
        message,
        result: data
    });
};

export const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    
    return res.status(err.status || 400).json({ 
        isSuccess: false,
        code: err.code || "COMMON400",
        message: err.message || "요청에 실패했습니다.",
        result: null
    });
};