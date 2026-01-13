import  pool  from '../config/database.js';

class RfidCard {
  static async findByUid(uid) {
    const result = await pool.query(
      'SELECT * FROM rfid_cards WHERE uid = $1',
      [uid]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM rfid_cards WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM rfid_cards WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async getDeviceByMac(mac) {
    const result = await pool.query(
      'SELECT id, user_id FROM access_control_devices WHERE mac_address = $1',
      [mac]
    );
    return result.rows[0];
  }

  static async logAccess({ card_uid, user_id, device_id, image_path, status, message }) {
    await pool.query(
      `INSERT INTO access_logs (card_uid, user_id, device_id, image_path, status, message) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [card_uid, user_id, device_id, image_path, status, message]
    );
  }

  static async create({ uid, user_id, card_name, expires_at }) {
    const result = await pool.query(
      `INSERT INTO rfid_cards (uid, user_id, card_name, expires_at) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [uid, user_id, card_name, expires_at]
    );
    return result.rows[0];
  }

  static async update(id, { card_name, is_active }) {
    const result = await pool.query(
      `UPDATE rfid_cards 
       SET card_name = COALESCE($1, card_name),
           is_active = COALESCE($2, is_active)
       WHERE id = $3 RETURNING *`,
      [card_name, is_active, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM rfid_cards WHERE id = $1', [id]);
  }
}

export default RfidCard;