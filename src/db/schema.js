const pool = require("./pool");
const bcrypt = require("bcryptjs");
const logger = require("../utils/logger");

async function initDb() {
  const client = await pool.connect();
  try {
    // Core tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        full_name TEXT,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'support',
        active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        logo_url TEXT,
        support_phone TEXT,
        support_email TEXT,
        primary_color TEXT DEFAULT '#0a3954',
        accent_color TEXT DEFAULT '#ff9800',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bandwidth_profiles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        download_speed INTEGER NOT NULL DEFAULT 5,
        upload_speed INTEGER NOT NULL DEFAULT 5,
        burst_download INTEGER,
        burst_upload INTEGER,
        priority INTEGER DEFAULT 8,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        duration TEXT NOT NULL,
        download_speed INTEGER DEFAULT 5,
        upload_speed INTEGER DEFAULT 5,
        burst_speed INTEGER,
        priority INTEGER DEFAULT 8,
        data_cap_mb INTEGER,
        unlimited BOOLEAN DEFAULT TRUE,
        device_limit INTEGER DEFAULT 1,
        bandwidth_profile_id INTEGER REFERENCES bandwidth_profiles(id),
        active BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS router_tokens (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS routers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        ip_address TEXT,
        api_port INTEGER DEFAULT 8728,
        api_username TEXT,
        api_password TEXT,
        hotspot_name TEXT DEFAULT 'hotspot',
        routeros_version TEXT,
        model TEXT,
        serial_number TEXT,
        mac_address TEXT,
        token TEXT UNIQUE,
        status TEXT DEFAULT 'offline',
        last_heartbeat TIMESTAMP,
        firmware TEXT,
        uptime TEXT,
        cpu_load INTEGER,
        free_memory INTEGER,
        active_users INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        admin_id INTEGER REFERENCES admins(id),
        permissions TEXT[] DEFAULT ARRAY['read'],
        active BOOLEAN DEFAULT TRUE,
        last_used TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        username TEXT,
        full_name TEXT,
        email TEXT,
        notes TEXT,
        status TEXT DEFAULT 'active',
        mac_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        mac_address TEXT NOT NULL UNIQUE,
        device_name TEXT,
        hostname TEXT,
        ip_address TEXT,
        vendor TEXT,
        router_id INTEGER REFERENCES routers(id),
        status TEXT DEFAULT 'active',
        blocked BOOLEAN DEFAULT FALSE,
        block_reason TEXT,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS device_history (
        id SERIAL PRIMARY KEY,
        device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        mac_address TEXT NOT NULL,
        event_type TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        amount INTEGER NOT NULL,
        package_id INTEGER REFERENCES packages(id),
        customer_id INTEGER REFERENCES customers(id),
        device_mac TEXT,
        router_id INTEGER REFERENCES routers(id),
        merchant_request_id TEXT,
        checkout_request_id TEXT UNIQUE,
        mpesa_receipt TEXT,
        status TEXT DEFAULT 'pending',
        result_code INTEGER,
        result_description TEXT,
        paid_at TIMESTAMP,
        activation_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_callbacks (
        id SERIAL PRIMARY KEY,
        payment_id INTEGER REFERENCES payments(id),
        checkout_request_id TEXT,
        raw_body JSONB,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        router_id INTEGER REFERENCES routers(id) ON DELETE SET NULL,
        device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
        package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
        payment_id INTEGER REFERENCES payments(id),
        ip_address TEXT,
        mac_address TEXT,
        hotspot_username TEXT,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiry_time TIMESTAMP NOT NULL,
        disconnect_time TIMESTAMP,
        status TEXT DEFAULT 'active',
        bytes_in BIGINT DEFAULT 0,
        bytes_out BIGINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        package_id INTEGER REFERENCES packages(id),
        batch_id TEXT,
        status TEXT DEFAULT 'unused',
        customer_id INTEGER REFERENCES customers(id),
        used_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        payment_id INTEGER REFERENCES payments(id),
        invoice_number TEXT NOT NULL UNIQUE,
        amount INTEGER NOT NULL,
        status TEXT DEFAULT 'paid',
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS router_events (
        id SERIAL PRIMARY KEY,
        router_id INTEGER REFERENCES routers(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS router_heartbeats (
        id SERIAL PRIMARY KEY,
        router_id INTEGER REFERENCES routers(id) ON DELETE CASCADE,
        cpu_load INTEGER,
        free_memory INTEGER,
        active_users INTEGER,
        uptime TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES admins(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        read BOOLEAN DEFAULT FALSE,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES admins(id),
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id INTEGER,
        description TEXT,
        ip_address TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default settings
    const defaultSettings = [
      ['brand_name', 'EMMATECH', 'Company brand name'],
      ['support_phone', '0768926965', 'Customer support phone'],
      ['support_email', '', 'Customer support email'],
      ['mpesa_env', process.env.MPESA_ENV || 'production', 'M-Pesa environment'],
      ['session_cleanup_interval', '60', 'Session monitor interval (seconds)'],
      ['max_retry_attempts', '3', 'Max payment retry attempts'],
      ['voucher_prefix', 'EM', 'Voucher code prefix']
    ];
    for (const [key, value, description] of defaultSettings) {
      await client.query(
        'INSERT INTO settings (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
        [key, value, description]
      );
    }

    // Default organization
    const orgExists = await client.query('SELECT id FROM organizations LIMIT 1');
    if (orgExists.rows.length === 0) {
      await client.query(
        `INSERT INTO organizations (name, support_phone) VALUES ($1, $2)`,
        ['EMMATECH', '0768926965']
      );
    }

    // Default admin account
    const adminExists = await client.query('SELECT id FROM admins WHERE username = $1', ['admin']);
    if (adminExists.rows.length === 0) {
      const hash = await bcrypt.hash('Admin@1234', 12);
      await client.query(
        `INSERT INTO admins (username, password, full_name, role) VALUES ($1, $2, $3, $4)`,
        ['admin', hash, 'System Administrator', 'administrator']
      );
      logger.info('Default admin created. Username: admin | Password: Admin@1234 — CHANGE THIS IMMEDIATELY!');
    }

    // Default bandwidth profiles
    const bwExists = await client.query('SELECT id FROM bandwidth_profiles LIMIT 1');
    if (bwExists.rows.length === 0) {
      await client.query(`
        INSERT INTO bandwidth_profiles (name, download_speed, upload_speed) VALUES
        ('basic', 2, 1), ('standard', 5, 3), ('premium', 10, 5), ('unlimited', 20, 10)
      `);
    }

    // Default packages if none exist
    const pkgExists = await client.query('SELECT id FROM packages LIMIT 1');
    if (pkgExists.rows.length === 0) {
      await client.query(`
        INSERT INTO packages (name, description, price, duration, download_speed, upload_speed, device_limit, display_order) VALUES
        ('1 Hour', 'Unlimited Access', 10, '1h', 5, 3, 1, 1),
        ('3 Hours', 'Unlimited Access', 20, '3h', 5, 3, 1, 2),
        ('24 Hours', 'Unlimited Access', 35, '24h', 5, 3, 1, 3),
        ('3 Days', 'Unlimited Access', 100, '3d', 8, 5, 2, 4),
        ('1 Week', 'Unlimited Access', 200, '7d', 8, 5, 2, 5),
        ('1 Month', 'Unlimited Access', 500, '30d', 10, 5, 3, 6)
      `);
    }

    logger.info('Database schema initialized successfully (20 tables)');
  } catch (err) {
    logger.error('DB schema init failed', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initDb };
