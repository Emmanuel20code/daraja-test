const pool = require("../db/pool");
const mikrotik = require("./mikrotik");
const logger = require("../utils/logger");

async function expireSessions() {
  try {
    // Find all sessions that have expired
    const expired = await pool.query(
      `SELECT s.*, r.ip_address, r.api_username, r.api_password, r.api_port, r.name AS router_name
       FROM sessions s
       LEFT JOIN routers r ON r.id = s.router_id
       WHERE s.status = 'active' AND s.expiry_time <= NOW()`
    );

    for (const session of expired.rows) {
      // Mark session as expired
      await pool.query(
        "UPDATE sessions SET status = 'expired', disconnect_time = NOW() WHERE id = $1",
        [session.id]
      );

      // Disconnect from MikroTik if router is available
      if (session.ip_address && session.api_username && session.hotspot_username) {
        try {
          await mikrotik.disconnectActiveUser(
            { ip_address: session.ip_address, api_username: session.api_username,
              api_password: session.api_password, api_port: session.api_port, name: session.router_name },
            session.hotspot_username
          );
          await mikrotik.removeHotspotUser(
            { ip_address: session.ip_address, api_username: session.api_username,
              api_password: session.api_password, api_port: session.api_port, name: session.router_name },
            session.hotspot_username
          );
        } catch (err) {
          logger.warn("Failed to disconnect expired session from router", { sessionId: session.id, error: err.message });
        }
      }

      logger.info("Session expired", { sessionId: session.id, username: session.hotspot_username });
    }

    if (expired.rows.length > 0) {
      logger.info(`Expired ${expired.rows.length} sessions`);
    }

    // Mark offline routers whose heartbeat is older than 3 minutes
    await pool.query(
      `UPDATE routers SET status = 'offline'
       WHERE status = 'online' AND (last_heartbeat IS NULL OR last_heartbeat < NOW() - INTERVAL '3 minutes')`
    );
  } catch (err) {
    logger.error("Session monitor error", { error: err.message });
  }
}

function startSessionMonitor() {
  const intervalSeconds = parseInt(process.env.SESSION_MONITOR_INTERVAL || "60");
  logger.info(`Session monitor started (every ${intervalSeconds}s)`);
  setInterval(expireSessions, intervalSeconds * 1000);
  // Run immediately on start
  expireSessions();
}

module.exports = { startSessionMonitor, expireSessions };
