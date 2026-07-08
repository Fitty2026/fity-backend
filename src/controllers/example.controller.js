const exampleService = require('../services/example.service');
const getExample = async (req, res, next) => {
    try{
        const data = await exampleService.getExampleData();
        res.status(200).json({
            isSuccess: true,
            code: "COMMON200",
            message: "예시 api 조회 성공",
            result: data
        });
    }catch (error){
        next(error);
    }
};

module.exports = {
    getExample,
};