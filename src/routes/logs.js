const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { page = 1, limit = 50, action } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = "";
    const params = [];
    if (action) { params.push(action); where = `WHERE al.action = $1`; }
    params.push(parseInt(limit), offset);
    const rows = await pool.query(
      `SELECT al.*, a.username
       FROM audit_logs al LEFT JOIN admins a ON a.id = al.admin_id
       ${where} ORDER BY al.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ logs: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/router-events", requireAuth(), async (req, res) => {
  try {
    const { router_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = router_id ? [router_id, parseInt(limit), offset] : [parseInt(limit), offset];
    const where = router_id ? "WHERE re.router_id = $1" : "";
    const rows = await pool.query(
      `SELECT re.*, r.name AS router_name FROM router_events re LEFT JOIN routers r ON r.id = re.router_id
       ${where} ORDER BY re.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ events: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
