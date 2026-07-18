import express from 'express';
import * as exampleController from '../controllers/example.controller.js';
import { closetRouter } from './closet.route.js'

const router = express.Router();

router.get('/example', exampleController.getExample);

//BE3 라우터
router.use('/v1/closets', closetRouter);

export default router;