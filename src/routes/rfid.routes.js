import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import authMiddleware from '../middleware/auth.middleware.js';
import {deviceAuth} from '../middleware/device.middleware.js';
import {
  handlerGetUserCards,
  handlerRegisterCard,
  handlerEnableScanMode,
  handlerCompleteScan,
  handlerUpdateCard,
  handlerDeleteCard
} from '../controllers/rfidCard.controller.js';

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



router.post('/rfid-cards/complete-scan',upload.single('image'),deviceAuth, handlerCompleteScan); // Called by ESP32

router.use(authMiddleware); // routes require login

router.get('/rfid-cards', handlerGetUserCards);
router.post('/rfid-cards/register', handlerRegisterCard);
router.post('/rfid-cards/scan-mode', handlerEnableScanMode);
router.put('/rfid-cards/:id', handlerUpdateCard);
router.delete('/rfid-cards/:id', handlerDeleteCard);

export default router;