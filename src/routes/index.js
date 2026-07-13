import express from 'express';
import * as exampleController from '../controllers/example.controller.js';
import imageRouter from './image.routes.js';
const router = express.Router();

router.get('/example', exampleController.getExample);
router.use('/v1/images', imageRouter);

export default router;
