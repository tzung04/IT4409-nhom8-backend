import { Router } from 'express';
import {  
  handlerRegister, handlerLogin, handlerLogout,
  handlerGetMe, handlerChangePassword,
  handlerForgotPassword, handlerResetPassword
} from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = Router();

// Public routes
router.post('/register', handlerRegister);
router.post('/login', handlerLogin);
router.post('/forgot-password', handlerForgotPassword);
router.post('/reset-password', handlerResetPassword);

// Protected routes
router.get('/me', authMiddleware, handlerGetMe);
router.put('/change-password', authMiddleware, handlerChangePassword);
router.post('/logout', authMiddleware, handlerLogout);


export default router;