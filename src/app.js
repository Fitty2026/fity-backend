require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sendResponse, errorHandler } = require('./middlewares/response.middleware');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res, next) => {
    try {
        const isMysqlConnected = true; //DB연결코드 없으므로 현재 true처리함.(나중에 수정해야함!)

        const healthCheck = {
            uptime: process.uptime(),               // 서버 가동 시간
            timestamp: new Date().toISOString(),    // 서버 현재 시간
            dbConnection_mysql: isMysqlConnected ? "CONNECTED" : "DISCONNECTED"
        };
        return sendResponse(res, healthCheck, "서버 및 데이터베이스 상태: 정상");

    } catch (error) {
        error.status = 503; // 에러발생 시 전역 에러 핸들러로 넘김
        error.code = "COMMON503";
        error.message = "서버 또는 외부 서비스가 준비되지 않았습니다.";
        next(error);
    }
});

app.use(errorHandler); //에러핸들러

app.listen(port, () => {
    console.log(`Fitty Server is running on port ${port}`);
});