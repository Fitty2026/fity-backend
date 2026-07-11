const express = require('express');
const router = express.Router();
const closetRouter = require('./closet_route');
const exampleController = require('../controllers/example.controller');

router.get('/example', exampleController.getExample);

//라우터추가시 여기에 작성하시면 됩니다.
//const ~~
//router.use ~~
router.use('/closets', closetRouter);

module.exports = router;