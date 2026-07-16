import express from 'express';
import { createImageController } from '../controllers/image.controller.js';
import { uploadSingleImage } from '../middlewares/image-upload.middleware.js';

export const createImageRouter = ({ imageService, authenticate }) => {
    const imageRouter = express.Router();
    const controller = createImageController(imageService);

    imageRouter.use(authenticate);
    imageRouter.post('/upload', uploadSingleImage, controller.uploadImage);
    imageRouter.get('/:imageId', controller.getImage);
    imageRouter.get('/:imageId/content', controller.getImageContent);
    imageRouter.delete('/:imageId', controller.deleteImage);

    return imageRouter;
};
