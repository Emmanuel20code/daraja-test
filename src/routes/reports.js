const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

router.get("/revenue", requireAuth(), async (req, res) => {
  try {
    const { period = "7d" } = req.query;
    const intervals = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "1y": "1 year" };
    const interval = intervals[period] || "30 days";
    const [daily, byPackage, total] = await Promise.all([
      pool.query(
        `SELECT DATE_TRUNC('day', paid_at) AS day, SUM(amount) AS revenue, COUNT(*) AS count
         FROM payments WHERE status='paid' AND paid_at >= NOW() - INTERVAL '${interval}'
         GROUP BY day ORDER BY day`
      ),
      pool.query(
        `SELECT pk.name, COUNT(p.id) AS sales, SUM(p.amount) AS revenue
         FROM payments p JOIN packages pk ON pk.id = p.package_id
         WHERE p.status='paid' AND p.paid_at >= NOW() - INTERVAL '${interval}'
         GROUP BY pk.name ORDER BY revenue DESC`
      ),
      pool.query(
        `SELECT SUM(amount) AS total, COUNT(*) AS count FROM payments
         WHERE status='paid' AND paid_at >= NOW() - INTERVAL '${interval}'`
      )
    ]);
    res.json({ daily: daily.rows, byPackage: byPackage.rows, summary: total.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/customers", requireAuth(), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS new_customers
       FROM customers WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY day ORDER BY day`
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
