import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path'
import authMiddleware from '../middleware/auth.middleware.js';
import {deviceAuth} from '../middleware/device.middleware.js';
import {
  handlerGetUserCards,
  handlerRegisterCard,
  handlerEnableScanMode,
  handlerCompleteScan,
  handlerUpdateCard,
  handlerDeleteCard,
  handlerGetUserDevices,
  handlerRegisterDevice,
  handlerUpdateDevice,
  handlerDeleteDevice,
  handlerGetDeviceLogs
} from '../controllers/accessControl.controller.js';

const router = express.Router();

// Tạo thư mục uploads nếu chưa có
const uploadDir = './uploads/access-logs';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const uid = req.body.uid || 'unknown';
    cb(null, `${uid}_${timestamp}.jpg`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// serve image
router.get('/images/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(uploadDir, filename);
  
  // Kiểm tra file có tồn tại không
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ message: 'Image not found' });
  }
  
  // Serve file
  res.sendFile(path.resolve(filepath));
});


router.post('/rfid-cards/complete-scan',upload.single('image'),deviceAuth, handlerCompleteScan); // Called by ESP32

router.use(authMiddleware); // routes require login

router.get('/rfid-cards', handlerGetUserCards);
router.post('/rfid-cards/register', handlerRegisterCard);
router.post('/rfid-cards/scan-mode', handlerEnableScanMode);
router.put('/rfid-cards/:id', handlerUpdateCard);
router.delete('/rfid-cards/:id', handlerDeleteCard);

// Device CRUD
router.get('/devices', handlerGetUserDevices);           // Lấy danh sách thiết bị
router.post('/devices', handlerRegisterDevice);          // Đăng ký thiết bị mới
router.put('/devices/:id', handlerUpdateDevice);         // Cập nhật thiết bị
router.delete('/devices/:id', handlerDeleteDevice);      // Xóa thiết bị

// Device logs
router.get('/devices/:id/logs', handlerGetDeviceLogs);   // Xem lịch sử truy cập

export default router;