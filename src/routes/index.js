import express from 'express';
import * as exampleController from '../controllers/example.controller.js';
import usersRouter from '../modules/users/users.routes.js';

const router = express.Router();

router.get('/example', exampleController.getExample);

router.use('/v1', usersRouter);

export default router;