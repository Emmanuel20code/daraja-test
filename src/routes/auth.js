const router = require("express").Router();
const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, requireAuth } = require("../middleware/auth");
const logger = require("../utils/logger");

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    const result = await pool.query(
      "SELECT * FROM admins WHERE username = $1 AND active = TRUE",
      [username.trim().toLowerCase()]
    );
    if (!result.rows.length) return res.status(401).json({ error: "Invalid credentials" });

    const admin = result.rows[0];
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    await pool.query("UPDATE admins SET last_login = NOW() WHERE id = $1", [admin.id]);

    const token = jwt.sign({ id: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: "24h" });

    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, description, ip_address)
       VALUES ($1, 'login', 'admin', $2, $3)`,
      [admin.id, `Login: ${admin.username}`, req.ip]
    );

    logger.info("Admin login", { username: admin.username, role: admin.role });
    res.json({ token, admin: { id: admin.id, username: admin.username, full_name: admin.full_name, role: admin.role } });
  } catch (err) {
    logger.error("Login error", { error: err.message });
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth(), (req, res) => {
  res.json({ admin: req.admin });
});

// PUT /api/auth/password
router.put("/password", requireAuth(), async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password || new_password.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    const result = await pool.query("SELECT password FROM admins WHERE id = $1", [req.admin.id]);
    const match = await bcrypt.compare(current_password, result.rows[0].password);
    if (!match) return res.status(401).json({ error: "Current password incorrect" });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query("UPDATE admins SET password = $1 WHERE id = $2", [hash, req.admin.id]);
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update password" });
  }
});

// GET /api/auth/admins (admin only)
router.get("/admins", requireAuth("administrator"), async (req, res) => {
  const result = await pool.query(
    "SELECT id, username, full_name, email, role, active, last_login, created_at FROM admins ORDER BY created_at DESC"
  );
  res.json({ admins: result.rows });
});

// POST /api/auth/admins (admin only)
router.post("/admins", requireAuth("administrator"), async (req, res) => {
  try {
    const { username, password, full_name, email, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    const validRoles = ["administrator", "manager", "support", "technician", "readonly"];
    if (!validRoles.includes(role)) return res.status(400).json({ error: "Invalid role" });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO admins (username, password, full_name, email, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name, email, role`,
      [username.trim().toLowerCase(), hash, full_name, email, role]
    );
    res.status(201).json({ admin: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Username already exists" });
    res.status(500).json({ error: "Failed to create admin" });
  }
});

module.exports = router;
