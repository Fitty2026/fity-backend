import express from 'express';
import { requestSync, registerItem, getItems, updateItem, deleteItem } from '../controllers/closet.controller.js';
export const closetRouter = express.Router();

//CLOSET-01 쇼핑몰 연동
closetRouter.post('/sync', requestSync);

//CLOSET-02 아이템 등록
closetRouter.post('/items', registerItem);

//CLOSET-03 아이템 조회
closetRouter.get('/items', getItems);   

//CLOSET-04 아이템 상세 조회로 구성했었으나
//피그마상에는 상세조회 기능 안보여서 나중에 물어보고 구현예정

//CLOSET-05 아이템 정보, 태그 수정
closetRouter.patch('/items/:itemId', updateItem);

//CLOSET-06 아이템 삭제
closetRouter.delete('/items/:itemId', deleteItem);