import express from 'express';
import * as historyController from '../controllers/history.controller.js'; // Nhớ thêm đuôi .js
import authMiddleware from '../middleware/auth.middleware.js'; // Nhớ thêm đuôi .js

const router = express.Router();

router.use(authMiddleware);

// Lấy lịch sử dữ liệu cảm biến (InfluxDB)
router.get('/sensor', historyController.getSensorDataHistory);

// Lấy lịch sử cảnh báo theo device (PostgreSQL)
router.get('/alerts-device', historyController.getAlertsHistoryByDevice);

// Lấy lịch sử cảnh báo theo user (PostgreSQL)
router.get('/alerts-user', historyController.getAlertsHistoryByUser);


export default router;