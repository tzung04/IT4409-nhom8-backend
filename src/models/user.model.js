import pool from '../config/database.js';

class User {
  static async create({ username, email, password_hash }) {
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash) 
       VALUES ($1, $2, $3) 
       RETURNING id, username, email, created_at`,
      [username, email, password_hash]
    );
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async updatePassword(id, password_hash) {
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
      [password_hash, id]
    );
    return result.rows[0];
  }

  static async saveResetCode(id, resetCode, resetExpires) {
    const result = await pool.query(
      'UPDATE users SET reset_code = $1, reset_expires = $2 WHERE id = $3 RETURNING id',
      [resetCode, resetExpires, id]
    );
    return result.rows[0];
  }

  static async findByResetCode(email, resetCode) {
    const result = await pool.query(
      `SELECT * FROM users 
       WHERE email = $1 
       AND reset_code = $2 
       AND reset_expires > $3`,
      [email, resetCode, Date.now()]
    );
    return result.rows[0];
  }

  static async resetPassword(id, password_hash) {
    const result = await pool.query(
      `UPDATE users 
       SET password_hash = $1, reset_code = NULL, reset_expires = NULL 
       WHERE id = $2 
       RETURNING id`,
      [password_hash, id]
    );
    return result.rows[0];
  }
}

export default User;