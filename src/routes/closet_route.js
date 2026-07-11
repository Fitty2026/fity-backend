const express = require('express');
const { getClosetList, postImportType, patchItemTags } = require('../controllers/closet.controller.js');
const closetRouter = express.Router();
//SCR-CLO-001
closetRouter.post('/import-type', postImportType);

//SCR-CLO-004
closetRouter.patch('/items/:itemId/tags', patchItemTags);

//SCR-CLO-005
closetRouter.get('/',getClosetList);

module.exports = closetRouter;