import pool from '../config/database.js';

class AlertLog {
  static async create({ device_id, rule_id, rule_severity, value_at_time, message }) {
    const result = await pool.query(
      `INSERT INTO alert_logs (device_id, rule_id, rule_severity, value_at_time, message) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [device_id, rule_id, rule_severity, value_at_time, message]
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

  static async findRecentByDeviceAndRule(deviceId, ruleId, minutesAgo = 5) {
    const query = `
        SELECT 
            *,
            NOW() as db_now,
            NOW() AT TIME ZONE 'UTC' as db_now_utc,
            triggered_at AT TIME ZONE 'UTC' as triggered_at_utc,
            EXTRACT(EPOCH FROM (NOW() - triggered_at)) / 60 as minutes_since_trigger,
            current_setting('TIMEZONE') as db_timezone
        FROM alert_logs 
        WHERE device_id = $1 
          AND rule_id = $2
          AND triggered_at > NOW() - INTERVAL '${minutesAgo} minutes'
        ORDER BY triggered_at DESC 
        LIMIT 1
    `;
    
    try {
        console.log(`[DB QUERY] findRecentByDeviceAndRule(device=${deviceId}, rule=${ruleId}, minutes=${minutesAgo})`);
        
        const result = await db.query(query, [deviceId, ruleId]);
        const alert = result.rows[0];
        
        if (alert) {
            console.log(`[DB RESULT] Found recent alert:`);
            console.log(`[DB RESULT]   Alert ID: ${alert.id}`);
            console.log(`[DB RESULT]   DB NOW (raw): ${alert.db_now}`);
            console.log(`[DB RESULT]   DB NOW (UTC): ${alert.db_now_utc}`);
            console.log(`[DB RESULT]   DB Timezone: ${alert.db_timezone}`);
            console.log(`[DB RESULT]   Triggered at (raw): ${alert.triggered_at}`);
            console.log(`[DB RESULT]   Triggered at (UTC): ${alert.triggered_at_utc}`);
            console.log(`[DB RESULT]   Minutes since trigger (DB calc): ${alert.minutes_since_trigger.toFixed(2)}`);
        } else {
            console.log(`[DB RESULT] No recent alert found within ${minutesAgo} minutes`);
        }
        
        return alert || null;
    } catch (err) {
        console.error('[DB ERROR] findRecentByDeviceAndRule:', err);
        console.error('[DB ERROR] Query:', query);
        console.error('[DB ERROR] Params:', [deviceId, ruleId]);
        return null;
    }
}

  static async findByFilter(user_id, { deviceId, fromDate, toDate, limit = 50 } = {}) {
    let query = `
       SELECT al.*, d.name as device_name 
       FROM alert_logs al
       JOIN devices d ON al.device_id = d.id
       WHERE d.user_id = $1
    `;
    
    const params = [user_id];
    
    let paramIndex = 2; 

    if (deviceId) {
        query += ` AND al.device_id = $${paramIndex}`;
        params.push(deviceId);
        paramIndex++;
    }

    if (fromDate) {
        query += ` AND al.triggered_at >= $${paramIndex}`;
        params.push(fromDate);
        paramIndex++;
    }

    if (toDate) {
        query += ` AND al.triggered_at <= $${paramIndex}`;
        params.push(toDate);
        paramIndex++;
    }

    query += ` ORDER BY al.triggered_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }
}

export default AlertLog;