import pool from '../config/database.js';

class AccessControlDevice {
  static async create({ user_id, place_id, mac_address, name }) {
    const result = await pool.query(
      `INSERT INTO access_control_devices (user_id, place_id, mac_address, name) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, place_id, mac_address.toUpperCase(), name]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM access_control_devices WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM access_control_devices WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByMac(mac) {
    const result = await pool.query(
      'SELECT * FROM access_control_devices WHERE mac_address = $1',
      [mac.toUpperCase()]
    );
    return result.rows[0];
  }

  static async update(id, { place_id, name, is_active }) {
    const result = await pool.query(
      `UPDATE access_control_devices 
       SET place_id = COALESCE($1, place_id),
           name = COALESCE($2, name),
           is_active = COALESCE($3, is_active)
       WHERE id = $4
       RETURNING *`,
      [place_id, name, is_active, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM access_control_devices WHERE id = $1', [id]);
  }
}

export default AccessControlDevice;