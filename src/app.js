import dotenv from 'dotenv';
dotenv.config();

import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { getPrisma } from './config/prisma.js';
import { authenticateJwt } from './middlewares/auth-context.middleware.js';
import { sendResponse, errorHandler } from './middlewares/response.middleware.js';
import { AuthRepository } from './repositories/auth.repository.js';
import { ImageRepository } from './repositories/image.repository.js';
import { OutfitRepository } from './repositories/outfit.repository.js';
import { PuzzleRepository } from './repositories/puzzle.repository.js';
import { createIndexRouter } from './routes/index.js';
import { AuthService } from './services/auth.service.js';
import { ImageService } from './services/image.service.js';
import { OutfitService } from './services/outfit.service.js';
import { OutfitAiAdapter } from './services/outfit-ai.service.js';
import { PuzzleService } from './services/puzzle.service.js';
import { GeminiOutfitAiAdapter } from './services/gemini-outfit-ai.service.js';
import { LocalImageStorage } from './storage/local-image.storage.js';
import { ClosetService } from './services/closet.service.js';
import { UserProfileService } from './services/user-profile.service.js';
import { ReceiptService } from './services/receipt.service.js';
import { ImageUrlSigner } from './services/image-url-signer.js';

const imageUrlSigner = new ImageUrlSigner();

const createDefaultImageService = () => {
    const repository = new ImageRepository(getPrisma);
    const storage = new LocalImageStorage({
        rootDirectory: process.env.IMAGE_STORAGE_ROOT || path.resolve('var/images')
    });
    return new ImageService({ repository, storage, urlSigner: imageUrlSigner, storageProvider: 'local' });
};

const createDefaultAuthService = () => new AuthService({
    repository: new AuthRepository(getPrisma)
});

const defaultHealthCheck = async () => {
    await getPrisma().$queryRaw`SELECT 1`;
};

const createDefaultClosetService = () => new ClosetService({ getPrisma, imageUrlSigner });
const createDefaultUserProfileService = () => new UserProfileService({ getPrisma });
const createDefaultOutfitAiAdapter = (imageService) => {
    if (process.env.AI_OUTFIT_ADAPTER_URL) return new OutfitAiAdapter();
    if (process.env.GEMINI_API_KEY) return new GeminiOutfitAiAdapter({ imageService });
    return new OutfitAiAdapter();
};
const createDefaultOutfitService = (imageService) => new OutfitService({
    repository: new OutfitRepository(getPrisma),
    aiAdapter: createDefaultOutfitAiAdapter(imageService)
});
const createDefaultPuzzleService = () => new PuzzleService({
    repository: new PuzzleRepository(getPrisma)
});
const createDefaultReceiptService = () => new ReceiptService({ getPrisma, imageUrlSigner });

export const createCorsOptions = (configuredOrigins = process.env.CORS_ALLOWED_ORIGINS) => {
    const allowedOrigins = configuredOrigins
        ?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (!allowedOrigins?.length) {
        return {};
    }

    return {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error('허용되지 않은 CORS origin입니다.'));
        }
    };
};

export const createApp = ({
    imageService = createDefaultImageService(),
    authService = createDefaultAuthService(),
    closetService = createDefaultClosetService(),
    userProfileService = createDefaultUserProfileService(),
    outfitService = createDefaultOutfitService(imageService),
    puzzleService = createDefaultPuzzleService(),
    receiptService = createDefaultReceiptService(),
    authenticate = authenticateJwt,
    healthCheck = defaultHealthCheck,
    internalToken = process.env.INTERNAL_WORKER_TOKEN
} = {}) => {
    const app = express();
    app.locals.imageService = imageService;
    app.locals.authService = authService;
    app.locals.closetService = closetService;
    app.locals.userProfileService = userProfileService;
    app.locals.outfitService = outfitService;
    app.locals.puzzleService = puzzleService;
    app.locals.receiptService = receiptService;

    app.use(cors(createCorsOptions()));
    app.use(express.json());
    app.use('/fallback', express.static(path.resolve('public/fallback'), {
        dotfiles: 'deny',
        fallthrough: false,
        index: false,
        maxAge: '1h'
    }));
    app.use('/api', createIndexRouter({
        imageService,
        authService,
        closetService,
        userProfileService,
        outfitService,
        puzzleService,
        receiptService,
        authenticate,
        internalToken
    }));

    app.get('/health', async (req, res, next) => {
        try {
            await healthCheck();
            const backendCommitSha = process.env.APP_VERSION || 'local';
            const frontendCommitSha = process.env.FRONTEND_COMMIT_SHA || 'unknown';
            return sendResponse(res, {
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                appVersion: backendCommitSha,
                commitSha: backendCommitSha,
                commitShort: backendCommitSha.slice(0, 7),
                backendCommitSha,
                backendCommitShort: backendCommitSha.slice(0, 7),
                frontendCommitSha,
                frontendCommitShort: frontendCommitSha.slice(0, 7),
                dbConnection_mysql: 'CONNECTED'
            }, '서버 및 데이터베이스 상태: 정상');
        } catch (cause) {
            const error = new Error('서버 또는 데이터베이스가 준비되지 않았습니다.', { cause });
            error.status = 503;
            error.code = 'COMMON503';
            return next(error);
        }
    });

    app.use((req, res, next) => {
        const error = new Error('요청한 API를 찾을 수 없습니다.');
        error.status = 404;
        error.code = 'NOT_FOUND404';
        return next(error);
    });

    app.use(errorHandler);
    return app;
};

export default createApp();
