import express from 'express';
import * as exampleController from '../controllers/example.controller.js';
import outfitRouter from './outfit.routes.js';

const router = express.Router();

router.get('/example', exampleController.getExample);
router.use('/v1/outfits', outfitRouter);

export default router;
