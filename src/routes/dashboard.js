const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

// GET /api/dashboard
router.get("/", requireAuth(), async (req, res) => {
  try {
    const [customers, activeSessions, todayRevenue, totalRevenue, onlineRouters,
           recentPayments, monthlyRevenue, activePackages] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM customers"),
      pool.query("SELECT COUNT(*) FROM sessions WHERE status = 'active'"),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='paid' AND paid_at >= CURRENT_DATE`),
      pool.query("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='paid'"),
      pool.query("SELECT COUNT(*) FROM routers WHERE status='online'"),
      pool.query(`
        SELECT p.id, p.phone, p.amount, p.status, p.paid_at, pk.name AS package_name
        FROM payments p LEFT JOIN packages pk ON pk.id = p.package_id
        ORDER BY p.created_at DESC LIMIT 10
      `),
      pool.query(`
        SELECT DATE_TRUNC('day', paid_at) AS day, COALESCE(SUM(amount),0) AS revenue
        FROM payments WHERE status='paid' AND paid_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
      `),
      pool.query("SELECT id, name, price, duration, active FROM packages ORDER BY display_order")
    ]);

    res.json({
      stats: {
        totalCustomers: parseInt(customers.rows[0].count),
        activeSessions: parseInt(activeSessions.rows[0].count),
        todayRevenue: parseInt(todayRevenue.rows[0].total),
        totalRevenue: parseInt(totalRevenue.rows[0].total),
        onlineRouters: parseInt(onlineRouters.rows[0].count)
      },
      recentPayments: recentPayments.rows,
      monthlyRevenue: monthlyRevenue.rows,
      packages: activePackages.rows
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// GET /api/dashboard/live-users
router.get("/live-users", requireAuth(), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.mac_address, s.hotspot_username, s.start_time, s.expiry_time,
             c.phone, c.full_name, pk.name AS package_name, r.name AS router_name
      FROM sessions s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN packages pk ON pk.id = s.package_id
      LEFT JOIN routers r ON r.id = s.router_id
      WHERE s.status = 'active'
      ORDER BY s.start_time DESC
    `);
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load live users" });
  }
});

module.exports = router;
