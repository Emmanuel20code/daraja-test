const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";

/**
 * Verify JWT and attach admin to req.admin
 */
function requireAuth(...roles) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const token = header.slice(7);
      const payload = jwt.verify(token, JWT_SECRET);

      // Check admin still active in DB
      const result = await pool.query(
        "SELECT id, username, role, active FROM admins WHERE id = $1",
        [payload.id]
      );
      if (!result.rows.length || !result.rows[0].active) {
        return res.status(401).json({ error: "Account not found or disabled" });
      }

      const admin = result.rows[0];

      // Role check
      if (roles.length > 0 && !roles.includes(admin.role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      req.admin = admin;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

/**
 * Optional API token auth (for router callbacks)
 */
async function requireApiToken(req, res, next) {
  const token = req.headers["x-api-token"] || req.query.api_token;
  if (!token) return res.status(401).json({ error: "API token required" });

  const result = await pool.query(
    `SELECT * FROM api_tokens WHERE token = $1 AND active = TRUE
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [token]
  );
  if (!result.rows.length) return res.status(401).json({ error: "Invalid API token" });

  await pool.query("UPDATE api_tokens SET last_used = NOW() WHERE id = $1", [result.rows[0].id]);
  req.apiToken = result.rows[0];
  next();
}

module.exports = { requireAuth, requireApiToken, JWT_SECRET };
