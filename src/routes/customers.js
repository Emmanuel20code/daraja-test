const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchParam = `%${search}%`;
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT c.*, 
           (SELECT COUNT(*) FROM sessions s WHERE s.customer_id = c.id AND s.status='active') AS active_sessions,
           (SELECT COUNT(*) FROM payments p WHERE p.customer_id = c.id AND p.status='paid') AS total_payments
         FROM customers c
         WHERE c.phone ILIKE $1 OR c.full_name ILIKE $1 OR c.email ILIKE $1
         ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
        [searchParam, parseInt(limit), offset]
      ),
      pool.query(
        "SELECT COUNT(*) FROM customers WHERE phone ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1",
        [searchParam]
      )
    ]);
    res.json({ customers: rows.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth(), async (req, res) => {
  try {
    const [customer, sessions, payments, devices] = await Promise.all([
      pool.query("SELECT * FROM customers WHERE id = $1", [req.params.id]),
      pool.query(`SELECT s.*, pk.name AS package_name, r.name AS router_name
        FROM sessions s LEFT JOIN packages pk ON pk.id = s.package_id LEFT JOIN routers r ON r.id = s.router_id
        WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 10`, [req.params.id]),
      pool.query(`SELECT p.*, pk.name AS package_name FROM payments p LEFT JOIN packages pk ON pk.id = p.package_id
        WHERE p.customer_id = $1 ORDER BY p.created_at DESC LIMIT 10`, [req.params.id]),
      pool.query("SELECT * FROM devices WHERE customer_id = $1", [req.params.id])
    ]);
    if (!customer.rows.length) return res.status(404).json({ error: "Customer not found" });
    res.json({ customer: customer.rows[0], sessions: sessions.rows, payments: payments.rows, devices: devices.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireAuth("administrator", "manager", "support"), async (req, res) => {
  try {
    const { phone, username, full_name, email, notes, status } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required" });
    const result = await pool.query(
      `INSERT INTO customers (phone, username, full_name, email, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [phone, username, full_name, email, notes, status || "active"]
    );
    res.status(201).json({ customer: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Phone number already registered" });
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", requireAuth("administrator", "manager", "support"), async (req, res) => {
  try {
    const { username, full_name, email, notes, status } = req.body;
    const result = await pool.query(
      `UPDATE customers SET username=$1, full_name=$2, email=$3, notes=$4, status=$5
       WHERE id=$6 RETURNING *`,
      [username, full_name, email, notes, status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Customer not found" });
    res.json({ customer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
