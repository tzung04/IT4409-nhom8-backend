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

        // Bảo mật: Xác thực quyền sở hữu thiết bị
        // Lấy device theo key và kiểm tra user_id
        const device = await Device.findByTopic(deviceKey);
        if (!device || device.user_id.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Thiết bị không tồn tại hoặc bạn không có quyền truy cập.' });
        }

        let hours = 24;
        if (timeRange.endsWith('h')) {
            hours = parseInt(timeRange.slice(1, -1));
        }

        const results = await querySensorData(device.device_serial, userId, hours);

        res.json(results);
    } catch (error) {
        console.error('API Error querying InfluxDB:', error);
        res.status(500).json({ error: 'Lỗi truy vấn dữ liệu cảm biến.' });
    }
};

export const getAlertsHistoryByUser = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const alerts = await AlertLog.findByUserId(userId);
        res.json(alerts);
    } catch (err) {
        console.error('PostgreSQL Alerts Query Error:', err);
        res.status(500).json({ error: 'Lỗi truy vấn lịch sử cảnh báo.' });
    }
};

// Lấy lịch sử cảnh báo có lọc từ PostgreSQL
export const getAlertsHistoryByDevice = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 1. Lấy tham số từ query string (?device_id=...&from=...&to=...)
        const { device_id, from, to } = req.query;

        // 2. Gọi hàm model mới với object chứa các bộ lọc
        const alerts = await AlertLog.findByFilter(userId, { 
            deviceId: device_id, 
            fromDate: from, 
            toDate: to, 
            limit: 100 
        });

        res.json(alerts);
    } catch (err) {
        console.error('PostgreSQL Alerts Query Error:', err);
        res.status(500).json({ error: 'Lỗi truy vấn lịch sử cảnh báo.' });
    }
};