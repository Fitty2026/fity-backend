import express from 'express';
import { createClosetController } from '../controllers/closet.controller.js';

export const createClosetRouter = ({ closetService, authenticate }) => {
    const router = express.Router();
    const controller = createClosetController(closetService);
    router.use(authenticate);
    router.post('/sync', controller.requestSync);
    router.post('/items', controller.registerItem);
    router.get('/items', controller.getItems);
    router.get('/items/:itemId', controller.getItem);
    router.patch('/items/:itemId', controller.updateItem);
    router.delete('/items/:itemId', controller.deleteItem);
    return router;
};
