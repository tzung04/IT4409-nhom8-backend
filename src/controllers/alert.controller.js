import AlertRule from '../models/alertRule.model.js';
import pool from '../config/database.js'; // Dùng để check quyền sở hữu thiết bị nhanh

// Helper function: Kiểm tra xem thiết bị có thuộc về user không
const checkDeviceOwnership = async (deviceId, userId) => {
    const result = await pool.query('SELECT user_id FROM devices WHERE id = $1', [deviceId]);
    if (result.rows.length === 0) return false;
    return result.rows[0].user_id === userId;
};

// Helper function: Lấy device_id từ rule_id để check quyền
const getDeviceIdByRuleId = async (ruleId) => {
    const result = await pool.query('SELECT device_id FROM alert_rules WHERE id = $1', [ruleId]);
    if (result.rows.length === 0) return null;
    return result.rows[0].device_id;
};

// --- CONTROLLERS ---

// Thêm cảnh báo mới
export const createRule = async (req, res) => {
    const { device_id, metric_type, condition, threshold, email_to, severity, is_enabled } = req.body;
    const userId = req.user.id;

    try {
        // 1. Bảo mật: Kiểm tra thiết bị có thuộc về User này không
        const isOwner = await checkDeviceOwnership(device_id, userId);
        if (!isOwner) {
            return res.status(403).json({ message: 'Bạn không có quyền tạo quy tắc cho thiết bị này.' });
        }

        // 2. Gọi Model để tạo
        const newRule = await AlertRule.create({
            device_id, 
            metric_type, 
            condition, 
            threshold, 
            email_to,
            severity, 
            is_enabled
        });

        res.status(201).json(newRule);
    } catch (err) {
        console.error('Error creating alert rule:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi tạo quy tắc cảnh báo.' });
    }
};

// Lấy tất cả cảnh báo theo Device ID
export const getRulesByDevice = async (req, res) => {
    const { deviceId } = req.params;
    const userId = req.user.id;

    try {
        // 1. Bảo mật: Kiểm tra quyền sở hữu
        const isOwner = await checkDeviceOwnership(deviceId, userId);
        if (!isOwner) {
            return res.status(403).json({ message: 'Bạn không có quyền xem quy tắc của thiết bị này.' });
        }

        // 2. Gọi Model để lấy dữ liệu
        const rules = await AlertRule.findByDeviceId(deviceId);
        
        res.json(rules);
    } catch (err) {
        console.error('Error getting rules:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi lấy quy tắc cảnh báo.' });
    }
};

// Cập nhật cảnh báo
export const updateRule = async (req, res) => {
    const { ruleId } = req.params;
    const { metric_type, condition, threshold, email_to, severity, is_enabled } = req.body;
    const userId = req.user.id;

    try {
        // 1. Tìm quy tắc để lấy device_id
        const deviceId = await getDeviceIdByRuleId(ruleId);
        if (!deviceId) {
            return res.status(404).json({ message: 'Quy tắc không tồn tại.' });
        }

        // 2. Bảo mật: Kiểm tra thiết bị thuộc rule này có phải của user không
        const isOwner = await checkDeviceOwnership(deviceId, userId);
        if (!isOwner) {
            return res.status(403).json({ message: 'Bạn không có quyền sửa quy tắc này.' });
        }

        // 3. Gọi Model để cập nhật
        const updatedRule = await AlertRule.update(ruleId, {
            metric_type, 
            condition, 
            threshold, 
            email_to,
            severity, 
            is_enabled
        });

        res.json(updatedRule);
    } catch (err) {
        console.error('Error updating rule:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật quy tắc.' });
    }
};

// Xóa cảnh báo
export const deleteRule = async (req, res) => {
    const { ruleId } = req.params;
    const userId = req.user.id;

    try {
        // 1. Tìm quy tắc để lấy device_id
        const deviceId = await getDeviceIdByRuleId(ruleId);
        if (!deviceId) {
            return res.status(404).json({ message: 'Quy tắc không tồn tại.' });
        }

        // 2. Bảo mật: Kiểm tra quyền sở hữu
        const isOwner = await checkDeviceOwnership(deviceId, userId);
        if (!isOwner) {
            return res.status(403).json({ message: 'Bạn không có quyền xóa quy tắc này.' });
        }

        // 3. Gọi Model để xóa
        await AlertRule.delete(ruleId);

        res.status(200).json({ message: 'Quy tắc cảnh báo đã được xóa thành công.' });
    } catch (err) {
        console.error('Error deleting rule:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi xóa quy tắc cảnh báo.' });
    }
};

//  Lấy tất cả cảnh báo theo User ID
export const getAllRulesByUser = async (req, res) => {
    const userId = req.user.id;
    try {
        const rules = await AlertRule.findByUserId(userId);
        res.json(rules);
    } catch (err) {
        console.error('Error getting user rules:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi lấy danh sách quy tắc.' });
    }
};