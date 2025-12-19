import express from 'express';
import { 
  handlerGetDashboardUrl, 
  handlerGetPanelUrl 
} from '../controllers/dashboard.controller.js'; 
import authMiddleware from '../middleware/auth.middleware.js'; 

const router = express.Router();

// Tất cả các route bên dưới đều yêu cầu đăng nhập
router.use(authMiddleware);

// Get full dashboard URL for current user
router.get('/url', handlerGetDashboardUrl);

// Get single panel URL for specific device
router.get('/panel', handlerGetPanelUrl);

export default router;