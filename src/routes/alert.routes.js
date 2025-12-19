import express from 'express';
import {createRule, getRulesByDevice, updateRule, deleteRule} from '../controllers/alert.controller.js';
import authMiddleware from '../middleware/auth.middleware.js'; 

const router = express.Router();

// Áp dụng middleware xác thực
router.use(authMiddleware); 

// Thêm cảnh báo mới
router.post('/', createRule);

// Lấy tất cả cảnh báo theo Device ID 
router.get('/:deviceId', getRulesByDevice);

// Cập nhật cảnh báo
router.put('/:ruleId', updateRule);

// Xóa cảnh báo
router.delete('/:ruleId', deleteRule);

export default router;