const router = require("express").Router();
const pool = require("../db/pool");
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

/**
 * GET /connect?token=TOKEN
 *
 * Returns a MikroTik RSC script that:
 *  1. Creates an API user on the router
 *  2. POSTs registration details back to the server
 *  3. Sets up a scheduler for heartbeat every 60 seconds
 *
 * Design note: A one-time token is generated in the admin dashboard and
 * presented to the router owner. The RSC script is ephemeral - the token
 * is consumed on first use. This is the closest secure alternative to
 * fully automatic onboarding without requiring manual IP/credentials entry.
 */
router.get("/", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send("# Error: token parameter required");

    const tokenRes = await pool.query(
      "SELECT * FROM router_tokens WHERE token = $1 AND used = FALSE",
      [token]
    );
    if (!tokenRes.rows.length) {
      return res.status(404).send("# Error: invalid or expired onboarding token");
    }

    // Mark token as used
    await pool.query("UPDATE router_tokens SET used=TRUE, used_at=NOW() WHERE id=$1", [tokenRes.rows[0].id]);

    // Generate API credentials for this router
    const routerApiUser = "wifi-billing";
    const routerApiPass = uuidv4().replace(/-/g, "").substring(0, 16);
    const routerToken = uuidv4();
    const appUrl = process.env.APP_URL || "https://your-app.onrender.com";

    // Create router record in DB (will be updated on first heartbeat)
    const routerRes = await pool.query(
      `INSERT INTO routers (name, token, api_username, api_password, status)
       VALUES ('New Router', $1, $2, $3, 'pending') RETURNING id`,
      [routerToken, routerApiUser, routerApiPass]
    );
    const routerId = routerRes.rows[0].id;

    logger.info("Router onboarding RSC downloaded", { routerId, token });

    // Generate RouterOS script
    const script = `:log info "EMMATECH WiFi Billing - Starting onboarding..."

# Create API user for billing system
/user add name=${routerApiUser} password=${routerApiPass} group=full

# Get router identity
:local routerName [/system identity get name]
:local routerMac [/interface ethernet get [find where name="ether1"] mac-address]

# Register with billing server
/tool fetch url="${appUrl}/api/routers/register" http-method=post \
  http-data="token=${routerToken}&name=$routerName&mac=$routerMac&apiUser=${routerApiUser}&apiPass=${routerApiPass}" \
  dst-path=register-result.txt

:log info "Router registered with EMMATECH billing system"

# Setup heartbeat scheduler
/system scheduler remove [find where name="emmatech-heartbeat"]
/system scheduler add name="emmatech-heartbeat" interval=1m \
  on-event="/tool fetch url=\\"${appUrl}/api/routers/heartbeat\\" http-method=post http-data=\\"token=${routerToken}&uptime=[/system resource get uptime]&cpu=[/system resource get cpu-load]&freeMemory=[/system resource get free-memory]&activeUsers=[/ip hotspot active print count-only]\\" dst-path=heartbeat.txt"

:log info "EMMATECH WiFi Billing onboarding complete! Router ID: ${routerId}"
`;

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="connect.rsc"`);
    res.send(script);
  } catch (err) {
    logger.error("Router connect error", { error: err.message });
    res.status(500).send("# Error: " + err.message);
  }
});

// POST /api/routers/register (called by RSC script)
router.post("/api/routers/register", async (req, res) => {
  try {
    const { token, name, mac, apiUser, apiPass } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });

    const r = await pool.query("SELECT id FROM routers WHERE token = $1", [token]);
    if (!r.rows.length) return res.status(404).json({ error: "Router not found" });

    await pool.query(
      "UPDATE routers SET name=$1, mac_address=$2, api_username=$3, api_password=$4, status='offline' WHERE id=$5",
      [name || "Router", mac, apiUser, apiPass, r.rows[0].id]
    );

    logger.info("Router self-registered", { routerId: r.rows[0].id, name });
    res.json({ ok: true, message: "Router registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
