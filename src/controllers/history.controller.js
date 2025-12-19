import { querySensorData } from '../config/influxdb.js';
import AlertLog from '../models/alertLog.model.js';
import Device from '../models/device.model.js';

// Lấy lịch sử dữ liệu cảm biến từ InfluxDB
export const getSensorDataHistory = async (req, res) => {
    const { deviceKey, timeRange = '-24h', sensorType } = req.query;

    if (!deviceKey) {
        return res.status(400).json({ message: 'Thiếu deviceKey.' });
    }

    try {
        const userId = req.user.id;

        // 1. Bảo mật: Xác thực quyền sở hữu thiết bị
        // Lấy device theo key và kiểm tra user_id
        const device = await Device.findByTopic(deviceKey);
        if (!device || device.user_id.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Thiết bị không tồn tại hoặc bạn không có quyền truy cập.' });
        }

        // Chuyển timeRange thành số giờ (vì hàm querySensorData mới nhận hours)
        let hours = 24;
        if (timeRange.endsWith('h')) {
            hours = parseInt(timeRange.slice(1, -1));
        }

        const results = await querySensorData(device.device_serial, hours);

        res.json(results);
    } catch (error) {
        console.error('API Error querying InfluxDB:', error);
        res.status(500).json({ error: 'Lỗi truy vấn dữ liệu cảm biến.' });
    }
};

// Lấy lịch sử cảnh báo từ PostgreSQL
export const getAlertsHistory = async (req, res) => {

    try {
        const userId = req.user.id;
        const alerts = await AlertLog.findByUserId(userId, 100);

        res.json(alerts);
    } catch (err) {
        console.error('PostgreSQL Alerts Query Error:', err);
        res.status(500).json({ error: 'Lỗi truy vấn lịch sử cảnh báo.' });
    }
};