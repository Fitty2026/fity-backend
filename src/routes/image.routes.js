import express from 'express';
import { uploadImage } from '../controllers/image.controller.js';
import { uploadSingleImage } from '../middlewares/image-upload.middleware.js';

const imageRouter = express.Router();

// BE2 Image/Upload API skeleton
imageRouter.post('/upload', uploadSingleImage, uploadImage);

export default imageRouter;
