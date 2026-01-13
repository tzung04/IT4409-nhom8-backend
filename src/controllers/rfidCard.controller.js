import RfidCard from '../models/rfidCard.model.js';

// GET /api/rfid-cards - Lấy tất cả thẻ của user hiện tại
export const handlerGetUserCards = async (req, res) => {
  try {
    const userId = req.user.id;
    const cards = await RfidCard.findByUserId(userId);
    
    return res.json({
      cards: cards.map(card => ({
        id: card.id,
        uid: card.uid,
        card_name: card.card_name,
        is_active: card.is_active,
        expires_at: card.expires_at,
        created_at: card.created_at
      }))
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/rfid-cards/register - Đăng ký thẻ mới
export const handlerRegisterCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { uid, card_name, expires_at } = req.body;

    // Validate UID format (8 hoặc 10 ký tự hex)
    if (!uid || !/^[0-9A-Fa-f]{8,10}$/.test(uid)) {
      return res.status(400).json({ 
        message: 'Invalid UID format. Must be 8-10 hex characters' 
      });
    }

    // Check if UID already exists
    const existingCard = await RfidCard.findByUid(uid);
    if (existingCard) {
      return res.status(409).json({ 
        message: 'This card is already registered',
        owner: existingCard.user_id === userId ? 'you' : 'another user'
      });
    }

    // Create new card
    const newCard = await RfidCard.create({
      uid: uid.toUpperCase(),
      user_id: userId,
      card_name: card_name || 'My Card',
      expires_at: expires_at || null
    });

    return res.status(201).json({
      message: 'Card registered successfully',
      card: {
        id: newCard.id,
        uid: newCard.uid,
        card_name: newCard.card_name,
        is_active: newCard.is_active
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/rfid-cards/scan-mode - Kích hoạt chế độ scan để đăng ký thẻ
export const handlerEnableScanMode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mac_address, card_name, duration_seconds } = req.body;

    if (!mac_address) {
      return res.status(400).json({ message: 'Device MAC address is required' });
    }

    // Key lưu trữ sẽ dựa trên MAC
    const sessionKey = `scan_${mac_address.toUpperCase()}`;
    const expiresAt = Date.now() + (duration_seconds || 60) * 1000;

    if (global.scanSessions?.[sessionKey]?.status === 'waiting') {
      return res.status(409).json({ 
        message: 'Scan mode already active for this device',
        expires_at: global.scanSessions[sessionKey].expires_at
      });
    }

    global.scanSessions = global.scanSessions || {};
    global.scanSessions[sessionKey] = {
      user_id: userId,
      card_name: card_name || 'New Card',
      expires_at: expiresAt,
      status: 'waiting'
    };

    return res.json({
      message: `Scan mode activated for device ${mac_address}`,
      expires_in: duration_seconds || 60
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/rfid-cards/complete-scan - ESP32 gọi khi phát hiện thẻ trong scan mode
export const handlerCompleteScan = async (req, res) => {
  try {
    const { uid, mac_address } = req.body;
    const imagePath = req.file ? req.file.path : null; 

    console.log('=== COMPLETE SCAN DEBUG ===');
    console.log('UID:', uid);
    console.log('MAC:', mac_address);
    console.log('Image uploaded:', !!req.file);

    if (!uid || !mac_address) {
      return res.status(400).json({ status: 'error', message: 'UID and MAC are required' });
    }

    if (!req.file) {
      console.warn(`No image uploaded for UID: ${uid}`);
    }

    // Lấy thông tin từ bảng thiết bị
    const device = await RfidCard.getDeviceByMac(mac_address.toUpperCase());
    if (!device) {
      console.error(`Device not found: ${mac_address}`);
      return res.status(404).json({ status: 'deny', message: 'Device not authorized' });
    }

    const sessionKey = `scan_${mac_address.toUpperCase()}`;
    const matchedSession = global.scanSessions?.[sessionKey];

    console.log('Session found:', !!matchedSession);
    console.log('Session status:', matchedSession?.status);
    console.log('Session expired:', matchedSession ? matchedSession.expires_at < Date.now() : 'N/A');

    // ============================================
    // CHẾ ĐỘ ĐĂNG KÝ (SCAN MODE)
    // ============================================
    if (matchedSession && 
        matchedSession.status === 'waiting' && 
        matchedSession.expires_at > Date.now()) {
      
      console.log('Processing in REGISTRATION mode');
      
      const existingCard = await RfidCard.findByUid(uid.toUpperCase());
      
      if (existingCard) {
        console.log('Card already exists, cleaning up session');
        // ✅ FIX: Dọn dẹp session trước khi return
        delete global.scanSessions[sessionKey];
        
        // ✅ FIX: Vẫn log access để có lịch sử
        await RfidCard.logAccess({
          card_uid: uid.toUpperCase(),
          user_id: existingCard.user_id,
          device_id: device.id,
          image_path: imagePath,
          status: 'deny',
          message: 'Card already registered (scan mode)'
        });
        
        return res.json({ 
          status: 'deny', 
          message: 'Card already registered' 
        });
      }

      // Đăng ký thẻ mới
      console.log('Registering new card');
      await RfidCard.create({
        uid: uid.toUpperCase(),
        user_id: matchedSession.user_id,
        card_name: matchedSession.card_name
      });

      // Log access
      await RfidCard.logAccess({
        card_uid: uid.toUpperCase(),
        user_id: matchedSession.user_id,
        device_id: device.id,
        image_path: imagePath,
        status: 'grant',
        message: 'Registration successful'
      });

      // Dọn dẹp session
      delete global.scanSessions[sessionKey];
      
      console.log('Registration completed successfully');
      return res.json({ status: 'grant', message: 'Registered' });
    }

    // ============================================
    // CHẾ ĐỘ TRUY CẬP BÌNH THƯỜNG
    // ============================================
    console.log('Processing in NORMAL ACCESS mode');
    
    const card = await RfidCard.findByUid(uid.toUpperCase());
    let status = 'deny';
    let msg = 'Unknown card';
    let ownerId = device.user_id; 

    if (card) {
      console.log('Card found:', card.uid);
      ownerId = card.user_id;
      
      if (!card.is_active) {
        msg = 'Card disabled';
        console.log('Card is disabled');
      } else if (card.expires_at && new Date(card.expires_at) < new Date()) {
        msg = 'Card expired';
        console.log('Card expired');
      } else {
        status = 'grant';
        msg = 'Access granted';
        console.log('Access granted');
      }
    } else {
      console.log('Card not found in database');
    }

    // Log access
    await RfidCard.logAccess({
      card_uid: uid.toUpperCase(),
      user_id: ownerId,
      device_id: device.id,
      image_path: imagePath,
      status: status,
      message: msg
    });

    console.log('Response:', { status, message: msg });
    return res.json({ status, message: msg });

  } catch (err) {
    console.error('RFID Complete Scan Error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// PUT /api/rfid-cards/:id - Cập nhật thẻ (đổi tên, active/inactive)
export const handlerUpdateCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const cardId = req.params.id;
    const { card_name, is_active } = req.body;

    // Verify ownership
    const card = await RfidCard.findById(cardId);
    if (!card || card.user_id !== userId) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Update
    const updated = await RfidCard.update(cardId, {
      card_name,
      is_active
    });

    return res.json({
      message: 'Card updated successfully',
      card: updated
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/rfid-cards/:id - Xóa thẻ
export const handlerDeleteCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const cardId = req.params.id;

    // Verify ownership
    const card = await RfidCard.findById(cardId);
    if (!card || card.user_id !== userId) {
      return res.status(404).json({ message: 'Card not found' });
    }

    await RfidCard.delete(cardId);

    return res.json({ message: 'Card deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};