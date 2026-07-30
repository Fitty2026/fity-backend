export const sendResponse = (res, data, message = "요청에 성공하였습니다.") => {
    return res.status(200).json({
        isSuccess: true,
        code: "COMMON200",
        message,
        result: data
    });
};

export const errorHandler = (err, req, res, next) => {
    const status = Number.isInteger(err.status) ? err.status : 500;
    const isExpected = Number.isInteger(err.status) && typeof err.code === 'string';

    if (status >= 500) {
        console.error(err.stack);
    }
    
    return res.status(status).json({
        isSuccess: false,
        code: isExpected ? err.code : 'COMMON500',
        message: isExpected ? err.message : '서버 내부 오류가 발생했습니다.',
        result: null
    });
};
