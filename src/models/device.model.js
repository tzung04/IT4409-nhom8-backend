import pool from '../config/database.js';

class Device {
  static async create({ user_id, place_id, mac_address, device_serial, name, topic, is_active = true }) {
    const result = await pool.query(
      `INSERT INTO devices (user_id, place_id, mac_address, device_serial, name, topic, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [user_id, place_id, mac_address, device_serial, name, topic, is_active]
    );
    return result.rows[0];
  }

  static async findByUserId(user_id) {
    const result = await pool.query(
      `SELECT d.*, p.name as place_name 
       FROM devices d 
       LEFT JOIN places p ON d.place_id = p.id 
       WHERE d.user_id = $1 
       ORDER BY d.created_at DESC`,
      [user_id]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT d.*, p.name as place_name 
       FROM devices d 
       LEFT JOIN places p ON d.place_id = p.id 
       WHERE d.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByMac(mac_address) {
    const result = await pool.query(
      'SELECT * FROM devices WHERE mac_address = $1',
      [mac_address]
    );
    return result.rows[0];
  }

  static async findByTopic(topic) {
    const result = await pool.query(
      'SELECT * FROM devices WHERE topic = $1',
      [topic]
    );
    return result.rows[0];
  }

  static async findActiveDevices() {
    const result = await pool.query(
      'SELECT * FROM devices WHERE is_active = $1',
      [true]
    );
    return result.rows;
  }

  static async update(id, { place_id, name, topic, is_active }) {
    const result = await pool.query(
      `UPDATE devices 
       SET place_id = COALESCE($1, place_id),
           name = COALESCE($2, name),
           topic = COALESCE($3, topic),
           is_active = COALESCE($4, is_active)
       WHERE id = $5 
       RETURNING *`,
      [place_id, name, topic, is_active, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM devices WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }
}

export default Device;