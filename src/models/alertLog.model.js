import pool from '../config/database.js';

class AlertLog {
  static async create({ device_id, rule_id, value_at_time, message }) {
    const result = await pool.query(
      `INSERT INTO alert_logs (device_id, rule_id, value_at_time, message) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [device_id, rule_id, value_at_time, message]
    );
    return result.rows[0];
  }

  static async findByDeviceId(device_id, limit = 50) {
    const result = await pool.query(
      'SELECT * FROM alert_logs WHERE device_id = $1 ORDER BY triggered_at DESC LIMIT $2',
      [device_id, limit]
    );
    return result.rows;
  }

  static async findByUserId(user_id, limit = 50) {
    const result = await pool.query(
      `SELECT al.*, d.name as device_name 
       FROM alert_logs al
       JOIN devices d ON al.device_id = d.id
       WHERE d.user_id = $1
       ORDER BY al.triggered_at DESC
       LIMIT $2`,
      [user_id, limit]
    );
    return result.rows;
  }

  static async findRecentByDeviceAndRule(device_id, rule_id, minutes = 5) {
    const result = await pool.query(
      `SELECT * FROM alert_logs 
       WHERE device_id = $1 AND rule_id = $2 
       AND triggered_at > NOW() - INTERVAL '${minutes} minutes'
       ORDER BY triggered_at DESC LIMIT 1`,
      [device_id, rule_id]
    );
    return result.rows[0];
  }
}

export default AlertLog;