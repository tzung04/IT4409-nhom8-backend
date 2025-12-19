import express from 'express';
import {
  handlerGetDeviceData,
  handlerGetLatestData,
  handlerGetAllDevicesLatest
} from '../controllers/data.controller.js'; 
import authMiddleware from '../middleware/auth.middleware.js'; 

const router = express.Router();

// Tất cả routes yêu cầu xác thực
router.use(authMiddleware);

// API lấy dữ liệu lịch sử của 1 thiết bị
// URL: /api/data/device/:deviceId?hours=24
router.get('/device/:deviceId', handlerGetDeviceData);

// API lấy dữ liệu mới nhất của 1 thiết bị
// URL: /api/data/device/:deviceId/latest
router.get('/device/:deviceId/latest', handlerGetLatestData);

// API lấy dữ liệu mới nhất cho dashboard tổng quan (Tất cả thiết bị)
// URL: /api/data/dashboard
router.get('/dashboard', handlerGetAllDevicesLatest);

export default router;