import express from 'express';
import * as controller from '../controllers/puzzle.controller.js';

export const createPuzzleRouter = ({ authenticate }) => {
    const router = express.Router();
    router.get('/balance', authenticate, controller.getBalance);
    return router;
};
