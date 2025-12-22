import pool from '../config/database.js'; 

class AlertRule {
  static async create({ device_id, metric_type, condition, threshold, email_to, severity = 'medium', is_enabled = true }) {
    const result = await pool.query(
      `INSERT INTO alert_rules (device_id, metric_type, condition, threshold, email_to, severity, is_enabled) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [device_id, metric_type, condition, threshold, email_to, severity, is_enabled]
    );
    return result.rows[0];
  }

  static async findByDeviceId(device_id) {
    const result = await pool.query(
      'SELECT * FROM alert_rules WHERE device_id = $1 ORDER BY created_at DESC',
      [device_id]
    );
    return result.rows;
  }

  static async findEnabledByDeviceId(device_id) {
    const result = await pool.query(
      'SELECT * FROM alert_rules WHERE device_id = $1 AND is_enabled = true',
      [device_id]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM alert_rules WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async update(id, { metric_type, condition, threshold, email_to, severity, is_enabled }) {
    
    if (severity) {
        const validSeverities = ['low', 'medium', 'high'];
        if (!validSeverities.includes(severity)) {
            throw new Error("Invalid severity. Allowed values: low, medium, high");
        }
    }

    const result = await pool.query(
      `UPDATE alert_rules 
       SET metric_type = COALESCE($1, metric_type),
           condition = COALESCE($2, condition),
           threshold = COALESCE($3, threshold),
           email_to = COALESCE($4, email_to),
           severity = COALESCE($5, severity),
           is_enabled = COALESCE($6, is_enabled)
       WHERE id = $7 
       RETURNING *`,
      [metric_type, condition, threshold, email_to, severity, is_enabled, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM alert_rules WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Lấy tất cả rule của một User 
  static async findByUserId(userId) {
    const query = `
      SELECT ar.*, d.name as device_name 
      FROM alert_rules ar
      JOIN devices d ON ar.device_id = d.id
      WHERE d.user_id = $1
      ORDER BY ar.created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }
}

export default AlertRule;