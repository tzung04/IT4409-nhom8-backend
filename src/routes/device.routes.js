import express from 'express';

import{createDevice, getAllUserDevices, getDeviceById, updateDevice, deleteDevice} from '../controllers/device.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

// Áp dụng middleware xác thực cho tất cả các route thiết bị
router.use(authMiddleware); 

// Lấy tất cả thiết bị của người dùng hiện tại
router.get('/', getAllUserDevices);

// Thêm thiết bị mới
router.post('/', createDevice);

// Lấy chi tiết thiết bị theo ID
router.get('/:deviceId', getDeviceById);

// Cập nhật thông tin thiết bị
router.put('/:deviceId', updateDevice);

// Xóa thiết bị
router.delete('/:deviceId', deleteDevice);

export default router;