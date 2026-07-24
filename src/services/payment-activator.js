const pool = require("../db/pool");
const mikrotik = require("./mikrotik");
const logger = require("../utils/logger");
const { calcExpiry, formatPhone, phoneToUsername, normalizeMac } = require("../utils/helpers");

/**
 * Activate internet access after a successful payment.
 * Flow: find/create customer → find router → bind device → create session → add MikroTik user
 */
async function activatePayment(paymentId) {
  const client = await pool.connect();
  try {
    // Load payment with package
    const pmtRes = await client.query(
      `SELECT p.*, pk.name AS pkg_name, pk.duration, pk.download_speed, pk.upload_speed, pk.device_limit
       FROM payments p
       JOIN packages pk ON pk.id = p.package_id
       WHERE p.id = $1`,
      [paymentId]
    );
    if (!pmtRes.rows.length) throw new Error(`Payment ${paymentId} not found`);
    const pmt = pmtRes.rows[0];

    if (pmt.status !== "paid") {
      logger.warn("activatePayment: payment not paid", { paymentId });
      return;
    }

    // Find or create customer
    let custRes = await client.query(
      "SELECT id FROM customers WHERE phone = $1",
      [pmt.phone]
    );
    let customerId;
    if (custRes.rows.length) {
      customerId = custRes.rows[0].id;
    } else {
      const ins = await client.query(
        "INSERT INTO customers (phone) VALUES ($1) RETURNING id",
        [pmt.phone]
      );
      customerId = ins.rows[0].id;
    }

    // Update payment with customer
    await client.query("UPDATE payments SET customer_id = $1 WHERE id = $2", [customerId, paymentId]);

    // Find an online router (prefer router linked to payment, else any online)
    let routerRes;
    if (pmt.router_id) {
      routerRes = await client.query("SELECT * FROM routers WHERE id = $1", [pmt.router_id]);
    }
    if (!routerRes?.rows.length) {
      routerRes = await client.query(
        "SELECT * FROM routers WHERE status = 'online' ORDER BY last_heartbeat DESC LIMIT 1"
      );
    }
    const router = routerRes?.rows[0] || null;

    // Handle device binding
    let deviceId = null;
    const mac = normalizeMac(pmt.device_mac);
    if (mac) {
      let devRes = await client.query("SELECT id FROM devices WHERE mac_address = $1", [mac]);
      if (devRes.rows.length) {
        deviceId = devRes.rows[0].id;
        await client.query(
          "UPDATE devices SET customer_id = $1, last_seen = NOW() WHERE id = $2",
          [customerId, deviceId]
        );
      } else {
        const ins = await client.query(
          `INSERT INTO devices (customer_id, mac_address, router_id, status)
           VALUES ($1, $2, $3, 'active') RETURNING id`,
          [customerId, mac, router?.id || null]
        );
        deviceId = ins.rows[0].id;
        await client.query(
          `INSERT INTO device_history (device_id, customer_id, mac_address, event_type, notes)
           VALUES ($1, $2, $3, 'bound', 'Auto-bound on payment')`,
          [deviceId, customerId, mac]
        );
      }
    }

    // Create session
    const expiry = calcExpiry(pmt.duration);
    const hotspotUsername = phoneToUsername(pmt.phone);
    const sessionRes = await client.query(
      `INSERT INTO sessions
         (customer_id, router_id, device_id, package_id, payment_id, mac_address, hotspot_username, expiry_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      [customerId, router?.id || null, deviceId, pmt.package_id, paymentId, mac, hotspotUsername, expiry]
    );
    const sessionId = sessionRes.rows[0].id;
    logger.info("Session created", { sessionId, customerId, expiry });

    // Add to MikroTik if router available
    if (router?.ip_address && router?.api_username) {
      try {
        const profileName = `pkg_${pmt.package_id}`;
        await mikrotik.ensureBandwidthProfile(router, {
          name: profileName,
          downloadSpeed: pmt.download_speed,
          uploadSpeed: pmt.upload_speed
        });

        // Convert duration to RouterOS format (e.g. "1h" → "01:00:00")
        const durationSec = Math.floor(require("../utils/helpers").parseDurationMs(pmt.duration) / 1000);
        const hh = Math.floor(durationSec / 3600).toString().padStart(2, "0");
        const mm = Math.floor((durationSec % 3600) / 60).toString().padStart(2, "0");
        const ss = (durationSec % 60).toString().padStart(2, "0");
        const timeLimit = `${hh}:${mm}:${ss}`;

        await mikrotik.addHotspotUser(router, {
          username: hotspotUsername,
          profile: profileName,
          timeLimit,
          macAddress: mac
        });
        logger.info("MikroTik user activated", { hotspotUsername, router: router.name });
      } catch (mikErr) {
        logger.error("MikroTik activation failed (session still created)", { error: mikErr.message });
        await client.query("UPDATE payments SET activation_error = $1 WHERE id = $2", [mikErr.message, paymentId]);
      }
    }

    // Notification
    await client.query(
      `INSERT INTO notifications (type, title, message, metadata)
       VALUES ('payment', 'New Payment', $1, $2)`,
      [
        `${pmt.phone} paid KES ${pmt.amount} for ${pmt.pkg_name}`,
        JSON.stringify({ paymentId, customerId, sessionId })
      ]
    );

    // Invoice
    const invoiceNo = `INV-${Date.now()}`;
    await client.query(
      `INSERT INTO invoices (customer_id, payment_id, invoice_number, amount)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [customerId, paymentId, invoiceNo, pmt.amount]
    );

    return { sessionId, customerId, expiry };
  } catch (err) {
    logger.error("activatePayment error", { paymentId, error: err.message });
    await pool.query("UPDATE payments SET activation_error = $1 WHERE id = $2", [err.message, paymentId]);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { activatePayment };
