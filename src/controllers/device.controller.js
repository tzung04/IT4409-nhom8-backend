import Device from '../models/device.model.js'; 
import AccessControlDevice from '../models/accessControl.model.js';
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
    const { name, mac_address, place_id, device_type } = req.body;
    const userId = req.user.id;

    if (!name || !mac_address || !device_type) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc (Tên, MAC, Loại thiết bị)." });
    }

    try {
        // PHÂN LUỒNG XỬ LÝ DỰA TRÊN DEVICE_TYPE
        if (device_type === 'access_control') {
            // Lưu vào bảng access_control_devices
            const newDevice = await AccessControlDevice.create({
                user_id: userId,
                place_id: place_id || null,
                mac_address,
                name
            });
            return res.status(201).json({ ...newDevice, device_type: 'access_control' });
        } 
        
        else if (device_type === 'sensor') {
            // Lưu vào bảng devices (Cảm biến) 
            const device_serial = crypto.randomBytes(8).toString('hex').toUpperCase();
            const topic = `/devices/${mac_address}/${device_serial}/data`;

            const newDevice = await Device.create({
                user_id: userId,
                place_id: place_id || null,
                mac_address: mac_address.toUpperCase(),
                device_serial,
                name,
                topic,
                is_active: false
            });
            return res.status(201).json({ ...newDevice, device_type: 'sensor' });
        } 
        
        else {
            return res.status(400).json({ message: "Loại thiết bị không hợp lệ." });
        }

    } catch (err) {
        console.error('Error creating device:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi tạo thiết bị.' });
    }
};

// Lấy tất cả thiết bị của người dùng hiện tại
export const getAllUserDevices = async (req, res) => {
    const userId = req.user.id;

    try {
        const devices = await Device.findByUserId(userId);
        
        // Import querySensorData để tính status
        const { querySensorData } = await import('../config/influxdb.js');
        
        // Tính status cho từng device
        const devicesWithStatus = await Promise.all(
            devices.map(async (device) => {
                try {
                    // Query latest data (1 hour)
                    const data = await querySensorData(device.name, userId, 1);
                    const latest = data.length > 0 ? data[data.length - 1] : null;
                    
                    // Xác định status
                    let status = 'inactive';
                    if (device.is_active) {
                        if (!latest) {
                            status = 'offline';
                        } else {
                            const lastDataTime = new Date(latest.time);
                            const now = new Date();
                            const diffMinutes = (now - lastDataTime) / 1000 / 60;
                            status = diffMinutes > 2 ? 'offline' : 'online';
                        }
                    }
                    
                    return {
                        ...device,
                        status,
                        lastSeen: latest ? latest.time : null
                    };
                } catch (err) {
                    console.error(`Error getting status for device ${device.id}:`, err);
                    return {
                        ...device,
                        status: 'error',
                        lastSeen: null
                    };
                }
            })
        );
        
        res.json(devicesWithStatus);
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
        if (!checkDevice) { // Xử lý cả null và false chung status 404/403 tùy ý, ở đây chặn chặt
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