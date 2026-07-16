import dotenv from 'dotenv';
dotenv.config();

import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { getPrisma } from './config/prisma.js';
import { requireAuthContext } from './middlewares/auth-context.middleware.js';
import { sendResponse, errorHandler } from './middlewares/response.middleware.js';
import { ImageRepository } from './repositories/image.repository.js';
import { createIndexRouter } from './routes/index.js';
import { ImageService } from './services/image.service.js';
import { LocalImageStorage } from './storage/local-image.storage.js';

const createDefaultImageService = () => {
    const repository = new ImageRepository(getPrisma);
    const storage = new LocalImageStorage({
        rootDirectory: process.env.IMAGE_STORAGE_ROOT || path.resolve('var/images')
    });
    return new ImageService({ repository, storage, storageProvider: 'local' });
};

const defaultHealthCheck = async () => {
    await getPrisma().$queryRaw`SELECT 1`;
};

export const createApp = ({
    imageService = createDefaultImageService(),
    authenticate = requireAuthContext,
    healthCheck = defaultHealthCheck
} = {}) => {
    const app = express();
    app.locals.imageService = imageService;

    app.use(cors());
    app.use(express.json());
    app.use('/api', createIndexRouter({ imageService, authenticate }));

    app.get('/health', async (req, res, next) => {
        try {
            await healthCheck();
            return sendResponse(res, {
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                dbConnection_mysql: 'CONNECTED'
            }, '서버 및 데이터베이스 상태: 정상');
        } catch (cause) {
            const error = new Error('서버 또는 데이터베이스가 준비되지 않았습니다.', { cause });
            error.status = 503;
            error.code = 'COMMON503';
            return next(error);
        }
    });

    app.use(errorHandler);
    return app;
};

export default createApp();
