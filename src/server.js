import app from './app.js';

const port = process.env.PORT || 3000;

try {
    await app.locals.imageService.reconcileStaleAssets();
    app.listen(port, () => {
        console.log(`Fitty Server is running on port ${port}`);
    });
} catch (error) {
    console.error('서버 시작 전 이미지 상태 복구에 실패했습니다.', error);
    process.exitCode = 1;
}
