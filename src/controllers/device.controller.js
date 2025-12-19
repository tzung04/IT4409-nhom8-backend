import Device from '../models/device.model.js'; 
import crypto from 'crypto';

// Helper function: Logic kiểm tra quyền sở hữu thiết bị
// Vì Model findById chỉ lấy theo ID, ta cần check thêm user_id ở controller
const validateOwnership = async (deviceId, userId) => {
    const device = await Device.findById(deviceId);
    if (!device) return null; // Không tìm thấy
    if (device.user_id !== userId) return false; // Có tồn tại nhưng không phải chủ sở hữu
    return device; // Trả về object device nếu hợp lệ
};

// --- CONTROLLERS ---

// Tạo thiết bị mới
export const createDevice = async (req, res) => {

    const { name, mac_address, place_id } = req.body;

    if (!req.user || !req.user.id) {
            return res.status(401).json({ message: "Không xác thực được người dùng." });
        }
        
    const userId = req.user.id;

    
    if (!name || !mac_address) {
            return res.status(400).json({ message: "Tên và địa chỉ MAC là bắt buộc." });
    }

    // Tự động tạo device_serial duy nhất 
    const device_serial = crypto.randomBytes(8).toString('hex').toUpperCase();
    const topic = `/devices/${mac_address}/${device_serial}/data`;

    try {
        const newDevice = await Device.create({
            user_id: userId,
            place_id: place_id || null, // Có thể null
            mac_address: mac_address.toUpperCase(),
            device_serial,
            name,
            topic,
            is_active: false
        });

        res.status(201).json(newDevice);
    } catch (err) {
        console.error('Error creating device:', err);

        if (err.name === 'SequelizeUniqueConstraintError' || err.code === 11000) {
             return res.status(409).json({ error: 'Serial thiết bị bị trùng, vui lòng thử lại.' });
        }
        
        if (err.name === 'SequelizeForeignKeyConstraintError') {
             return res.status(400).json({ error: 'Khu vực (Place) không hợp lệ.' });
        }
        
        res.status(500).json({ error: 'Lỗi máy chủ khi tạo thiết bị.' });
    }
};

// Lấy tất cả thiết bị của người dùng hiện tại
export const getAllUserDevices = async (req, res) => {
    const userId = req.user.id;

    try {
        const devices = await Device.findByUserId(userId);
        res.json(devices);
    } catch (err) {
        console.error('Error getting user devices:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi lấy danh sách thiết bị.' });
    }
};

// Lấy chi tiết thiết bị theo ID
export const getDeviceById = async (req, res) => {
    const { deviceId } = req.params;
    const userId = req.user.id;

    try {
        // Sử dụng helper function để tìm và check quyền
        const device = await validateOwnership(deviceId, userId);

        if (device === null) {
            return res.status(404).json({ message: 'Thiết bị không tồn tại.' });
        }
        if (device === false) {
            return res.status(403).json({ message: 'Bạn không có quyền truy cập thiết bị này.' });
        }

        res.json(device);
    } catch (err) {
        console.error('Error getting device detail:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi lấy chi tiết thiết bị.' });
    }
};

// Cập nhật thông tin thiết bị
export const updateDevice = async (req, res) => {
    const { deviceId } = req.params;
    const { name, topic, place_id, is_active } = req.body;
    const userId = req.user.id;

    try {
        // 1. Kiểm tra quyền sở hữu trước khi update
        const checkDevice = await validateOwnership(deviceId, userId);
        if (!checkDevice) { 
             return res.status(404).json({ message: 'Thiết bị không tồn tại hoặc bạn không có quyền.' });
        }

        // 2. Gọi Model update
        const updatedDevice = await Device.update(deviceId, {
            place_id,
            name,
            topic,
            is_active
        });

        res.json(updatedDevice);
    } catch (err) {
        console.error('Error updating device:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật thiết bị.' });
    }
};

// Xóa thiết bị
export const deleteDevice = async (req, res) => {
    const { deviceId } = req.params;
    const userId = req.user.id;

    try {
        // 1. Kiểm tra quyền sở hữu trước khi xóa
        const checkDevice = await validateOwnership(deviceId, userId);
        if (!checkDevice) {
             return res.status(404).json({ message: 'Thiết bị không tồn tại hoặc bạn không có quyền xóa.' });
        }

        // 2. Gọi Model delete
        await Device.delete(deviceId);

        res.status(200).json({ message: 'Thiết bị và dữ liệu liên quan đã được xóa thành công.' });
    } catch (err) {
        console.error('Error deleting device:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi xóa thiết bị.' });
    }
};