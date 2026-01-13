import pool from '../config/database.js';
import AccessControlDevice from '../models/accessControl.model.js';
import RfidCard from '../models/rfidCard.model.js';

// GET /api/access-control/rfid-cards - Lấy tất cả thẻ của user hiện tại
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

// POST /api/access-control/rfid-cards/register - Đăng ký thẻ mới
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

// POST /api/access-control/rfid-cards/scan-mode - Kích hoạt chế độ scan để đăng ký thẻ
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

// POST /api/access-control/rfid-cards/complete-scan - ESP32 gọi khi phát hiện thẻ trong scan mode
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
        // Dọn dẹp session trước khi return
        delete global.scanSessions[sessionKey];
        
        // Vẫn log access để có lịch sử
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

// PUT /api/access-control/rfid-cards/:id - Cập nhật thẻ (đổi tên, active/inactive)
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

// DELETE /api/access-control/rfid-cards/:id - Xóa thẻ
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

// DEVICE

// GET /api/access-control/devices - Lấy danh sách thiết bị của user
export const handlerGetUserDevices = async (req, res) => {
  try {
    const userId = req.user.id;
    const devices = await AccessControlDevice.findByUserId(userId);
    
    return res.json({
      devices: devices.map(device => ({
        id: device.id,
        mac_address: device.mac_address,
        name: device.name,
        place_id: device.place_id,
        is_active: device.is_active,
        created_at: device.created_at
      }))
    });
  } catch (err) {
    console.error('Get devices error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/access-control/devices - Đăng ký thiết bị mới
export const handlerRegisterDevice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mac_address, name, place_id } = req.body;

    // Validate required fields
    if (!mac_address || !name) {
      return res.status(400).json({ 
        message: 'MAC address and device name are required' 
      });
    }

    // Validate MAC format (basic check)
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^[0-9A-Fa-f]{12}$/;
    if (!macRegex.test(mac_address)) {
      return res.status(400).json({ 
        message: 'Invalid MAC address format' 
      });
    }

    // Check if MAC already exists
    const existingDevice = await pool.query(
      'SELECT id, user_id FROM access_control_devices WHERE mac_address = $1',
      [mac_address.toUpperCase()]
    );

    if (existingDevice.rows.length > 0) {
      const isOwner = existingDevice.rows[0].user_id === userId;
      return res.status(409).json({ 
        message: 'This MAC address is already registered',
        owner: isOwner ? 'you' : 'another user'
      });
    }

    // Create new device
    const newDevice = await AccessControlDevice.create({
      user_id: userId,
      place_id: place_id || null,
      mac_address: mac_address.toUpperCase(),
      name: name
    });

    return res.status(201).json({
      message: 'Device registered successfully',
      device: {
        id: newDevice.id,
        mac_address: newDevice.mac_address,
        name: newDevice.name,
        place_id: newDevice.place_id,
        is_active: newDevice.is_active,
        created_at: newDevice.created_at
      }
    });
  } catch (err) {
    console.error('Register device error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/access-control/devices/:id - Cập nhật thiết bị
export const handlerUpdateDevice = async (req, res) => {
  try {
    const userId = req.user.id;
    const deviceId = req.params.id;
    const { name, place_id, is_active } = req.body;

    // Verify ownership
    const device = await AccessControlDevice.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Check ownership through user_id
    const ownerCheck = await pool.query(
      'SELECT user_id FROM access_control_devices WHERE id = $1',
      [deviceId]
    );

    if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update device
    const updated = await AccessControlDevice.update(deviceId, {
      name,
      place_id,
      is_active
    });

    return res.json({
      message: 'Device updated successfully',
      device: {
        id: updated.id,
        mac_address: updated.mac_address,
        name: updated.name,
        place_id: updated.place_id,
        is_active: updated.is_active
      }
    });
  } catch (err) {
    console.error('Update device error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/access-control/devices/:id - Xóa thiết bị
export const handlerDeleteDevice = async (req, res) => {
  try {
    const userId = req.user.id;
    const deviceId = req.params.id;

    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT user_id FROM access_control_devices WHERE id = $1',
      [deviceId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    if (ownerCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get all images from access_logs before deleting
    const logsWithImages = await pool.query(
      'SELECT image_path FROM access_logs WHERE device_id = $1 AND image_path IS NOT NULL',
      [deviceId]
    );

    // Delete device (logs will be handled by ON DELETE SET NULL)
    await AccessControlDevice.delete(deviceId);

    // Delete images from filesystem
    /*
    for (const log of logsWithImages.rows) {
      try {
        if (fs.existsSync(log.image_path)) {
          fs.unlinkSync(log.image_path);
        }
      } catch (imgErr) {
        console.error('Failed to delete image:', log.image_path, imgErr);
      }
    }
    */

    return res.json({ 
      message: 'Device deleted successfully',
      note: 'Access logs are preserved with device_id set to NULL'
    });
  } catch (err) {
    console.error('Delete device error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/access-control/devices/:id/logs - Xem lịch sử truy cập
export const handlerGetDeviceLogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const deviceId = req.params.id;
    
    // Query parameters for filtering and pagination
    const { 
      status,           // 'grant' or 'deny'
      from_date,        // ISO date string
      to_date,          // ISO date string
      limit = 50,       // Default 50 records
      offset = 0        // For pagination
    } = req.query;

    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT user_id FROM access_control_devices WHERE id = $1',
      [deviceId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    if (ownerCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Build dynamic query
    let queryText = `
      SELECT 
        al.id,
        al.card_uid,
        al.user_id,
        al.device_id,
        al.image_path,
        al.status,
        al.message,
        al.timestamp,
        rc.card_name,
        rc.is_active as card_is_active
      FROM access_logs al
      LEFT JOIN rfid_cards rc ON al.card_uid = rc.uid
      WHERE al.device_id = $1
    `;
    
    const queryParams = [deviceId];
    let paramIndex = 2;

    // Filter by status
    if (status && (status === 'grant' || status === 'deny')) {
      queryText += ` AND al.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    // Filter by date range
    if (from_date) {
      queryText += ` AND al.timestamp >= $${paramIndex}`;
      queryParams.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      queryText += ` AND al.timestamp <= $${paramIndex}`;
      queryParams.push(to_date);
      paramIndex++;
    }

    // Order by timestamp descending
    queryText += ` ORDER BY al.timestamp DESC`;

    // Add pagination
    queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit), parseInt(offset));

    // Execute query
    const result = await pool.query(queryText, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM access_logs
      WHERE device_id = $1
    `;
    const countParams = [deviceId];
    let countIndex = 2;

    if (status && (status === 'grant' || status === 'deny')) {
      countQuery += ` AND status = $${countIndex}`;
      countParams.push(status);
      countIndex++;
    }

    if (from_date) {
      countQuery += ` AND timestamp >= $${countIndex}`;
      countParams.push(from_date);
      countIndex++;
    }

    if (to_date) {
      countQuery += ` AND timestamp <= $${countIndex}`;
      countParams.push(to_date);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalRecords = parseInt(countResult.rows[0].total);

    return res.json({
      logs: result.rows.map(log => ({
        id: log.id,
        card_uid: log.card_uid,
        card_name: log.card_name || 'Unknown Card',
        card_is_active: log.card_is_active,
        status: log.status,
        message: log.message,
        image_path: log.image_path,
        timestamp: log.timestamp
      })),
      pagination: {
        total: totalRecords,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: (parseInt(offset) + parseInt(limit)) < totalRecords
      }
    });
  } catch (err) {
    console.error('Get device logs error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};