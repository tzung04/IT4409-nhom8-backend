import pool from '../config/database.js';

class Place {
  static async create({ user_id, name, description }) {
    const result = await pool.query(
      `INSERT INTO places (user_id, name, description) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [user_id, name, description]
    );
    return result.rows[0];
  }

  static async findByUserId(user_id) {
    const result = await pool.query(
      'SELECT * FROM places WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM places WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async update(id, { name, description }) {
    const result = await pool.query(
      `UPDATE places 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description)
       WHERE id = $3 
       RETURNING *`,
      [name, description, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM places WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }
}

export default Place;