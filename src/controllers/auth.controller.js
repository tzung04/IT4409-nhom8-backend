 import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto'
import  User from '../models/user.model.js';
import emailService from '../services/email.service.js';


export const handlerRegister = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        message: 'Username, email and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        message: 'Password must be at least 6 characters' 
      });
    }

    // Check if user exists
    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.status(409).json({ 
        message: 'Username already exists' 
      });
    }

    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ 
        message: 'Email already exists' 
      });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      username,
      email,
      password_hash: hash
    });

      return res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const handlerLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Username and password are required' 
      });
    }

    // Find user
    const user = await User.findByUsername(username);

    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid username or password' 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
    return res.status(401).json({ 
        message: 'Invalid username or password' 
    });
    }

    // Generate JWT token
    const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d'}
    );

    return res.json({
        message: 'Login successful',
        user: {
            id: user.id,
            username: user.username,
            email: user.email
        },
        token
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const handlerGetMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    delete user.password_hash;
    delete user.reset_code;
    delete user.reset_expires;

    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const handlerChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'New password must be at least 6 characters' 
      });
    }

    // Find user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
        return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hash = await bcrypt.hash(newPassword, 10);

    // Update password 
    await User.updatePassword(req.user.id, hash);

    return res.status(200).json({ message: 'Password changed successfully' });
    
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const handlerForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Tạo mã reset 6 ký tự
    const resetCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const resetExpires = Date.now() + 5 * 60 * 1000; // 5 phút

    // Lưu mã reset vào DB 
    await User.saveResetCode(user.id, resetCode, resetExpires);

    // Gửi email với resetCode
    const emailSent = await emailService.sendResetPasswordEmail(user.email, user.username, resetCode);

    if (!emailSent) {
      return res.status(500).json({ 
        message: 'Failed to send email. Please try again later.' 
      });
    }

    return res.status(200).json({ 
      message: 'Reset code sent to email'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const handlerResetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'New password must be at least 6 characters' 
      });
    }

    // Tìm user và verify code 
    const user = await User.findByResetCode(email, code);
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    // Hash password mới
    const hash = await bcrypt.hash(newPassword, 10);

    // Cập nhật password và xóa reset code
    await User.resetPassword(user.id, hash);

    return res.status(200).json({ message: 'Password reset successful' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const handlerLogout = async (req, res) => {
  try {
    return res.status(200).json({ 
      message: 'Logout successful' 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

