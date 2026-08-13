import express from 'express';
import { createImageController } from '../controllers/image.controller.js';
import { uploadSingleImage } from '../middlewares/image-upload.middleware.js';

export const createImageRouter = ({ imageService, authenticate }) => {
    const imageRouter = express.Router();
    const controller = createImageController(imageService);

    imageRouter.get('/:imageId/content', (req, res, next) => {
        if (req.query.expires !== undefined || req.query.signature !== undefined) {
            return controller.getSignedImageContent(req, res, next);
        }
        return authenticate(req, res, (error) => error
            ? next(error)
            : controller.getImageContent(req, res, next));
    });
    imageRouter.post('/upload', authenticate, uploadSingleImage, controller.uploadImage);
    imageRouter.get('/:imageId', authenticate, controller.getImage);
    imageRouter.delete('/:imageId', authenticate, controller.deleteImage);

    return imageRouter;
};
