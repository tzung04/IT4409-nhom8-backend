import express from 'express';
import {
  createPlace,
  getMyPlaces,
  getPlaceById,
  updatePlace,
  deletePlace
} from '../controllers/place.controller.js';
import authMiddleware from '../middleware/auth.middleware.js'; 

const router = express.Router();


// 1. Tạo địa điểm mới
router.post('/', authMiddleware, createPlace);

// 2. Lấy danh sách địa điểm của user đang đăng nhập
router.get('/', authMiddleware, getMyPlaces);

// 3. Lấy chi tiết một địa điểm theo ID
router.get('/:id', authMiddleware, getPlaceById);

// 4. Cập nhật địa điểm 
router.put('/:id', authMiddleware, updatePlace);

// 5. Xóa địa điểm 
router.delete('/:id', authMiddleware, deletePlace);

export default router;