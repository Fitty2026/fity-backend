import express from 'express';
import * as exampleController from '../controllers/example.controller.js';
import closetRouter from './closet_route.js'
const router = express.Router();

router.get('/example', exampleController.getExample);
// 라우터 추가 시 여기에 작성하시면 됩니다.
router.use('/closets', closetRouter);

export default router;