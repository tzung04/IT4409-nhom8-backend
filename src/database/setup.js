import pool from "../config/database.js";
import { fileURLToPath } from "url";

export async function setupDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("Creating ENUM types...");

    // Create metric_type enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE metric_type AS ENUM ('temperature', 'humidity');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create alert_condition enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE alert_condition AS ENUM ('greater_than', 'less_than', 'equal', 'not_equal', 'greater_than_or_equal', 'less_than_or_equal');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create severity_level enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("Creating tables...");

    // Users table 
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        reset_code VARCHAR(10),
        reset_expires BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Places table 
    await client.query(`
      CREATE TABLE IF NOT EXISTS places (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Devices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
        mac_address VARCHAR(100) UNIQUE NOT NULL,
        device_serial VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        topic VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Alert rules table 
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_rules (
        id SERIAL PRIMARY KEY,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        metric_type metric_type NOT NULL,
        condition alert_condition NOT NULL,
        threshold FLOAT NOT NULL,
        email_to VARCHAR(255) NOT NULL,
        severity severity_level DEFAULT 'medium', 
        is_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Alert logs table 
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_logs (
        id SERIAL PRIMARY KEY,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        rule_id INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
        rule_severity severity_level DEFAULT 'medium',
        value_at_time FLOAT NOT NULL,
        message TEXT NOT NULL,
        triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Creating indexes...");

    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_devices_topic ON devices(topic);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_alert_rules_device ON alert_rules(device_id);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_alert_logs_device ON alert_logs(device_id);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_alert_logs_triggered ON alert_logs(triggered_at);"
    );

    await client.query("COMMIT");

    console.log("✓ Database setup completed successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Database setup failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

export default { setupDatabase };

// ----------------------
// RUN IF EXECUTED DIRECTLY 
// ----------------------
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  setupDatabase()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}