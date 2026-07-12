import express from 'express'
import { getClosetList, postImportType, patchItemTags } from '../controllers/closet.controller.js';
const closetRouter = express.Router();
//SCR-CLO-001
closetRouter.post('/import-type', postImportType);

//SCR-CLO-004
closetRouter.patch('/items/:itemId/tags', patchItemTags);

//SCR-CLO-005
closetRouter.get('/',getClosetList);

export default closetRouter;