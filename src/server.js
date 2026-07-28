import app from './app.js';
import { disconnectPrisma } from './config/prisma.js';

const port = process.env.PORT || 3000;
const configuredShutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);
const shutdownTimeoutMs = Number.isFinite(configuredShutdownTimeoutMs) && configuredShutdownTimeoutMs > 0
    ? configuredShutdownTimeoutMs
    : 10000;
let server;
let shuttingDown = false;

const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} 신호를 받아 서버를 종료합니다.`);

    const forceExitTimer = setTimeout(() => {
        console.error('정상 종료 제한 시간을 초과했습니다.');
        process.exit(1);
    }, shutdownTimeoutMs);
    forceExitTimer.unref();

    const finishShutdown = async (error) => {
        try {
            await disconnectPrisma();
        } catch (disconnectError) {
            console.error('Prisma 연결 종료에 실패했습니다.', disconnectError);
            process.exitCode = 1;
        }

        if (error) {
            console.error('HTTP 서버 종료에 실패했습니다.', error);
            process.exitCode = 1;
        }

        clearTimeout(forceExitTimer);
        process.exit();
    };

    if (!server) {
        void finishShutdown();
        return;
    }
    server.close(finishShutdown);
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

try {
    await app.locals.imageService.reconcileStaleAssets();
    server = app.listen(port, () => {
        console.log(`Fitty Server is running on port ${port}`);
    });
} catch (error) {
    console.error('서버 시작 전 이미지 상태 복구에 실패했습니다.', error);
    process.exitCode = 1;
}
