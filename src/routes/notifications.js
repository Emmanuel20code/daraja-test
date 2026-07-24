const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth(), async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const rows = await pool.query(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [parseInt(limit), offset]
  );
  const unread = await pool.query("SELECT COUNT(*) FROM notifications WHERE read = FALSE");
  res.json({ notifications: rows.rows, unread: parseInt(unread.rows[0].count) });
});

router.post("/read-all", requireAuth(), async (req, res) => {
  await pool.query("UPDATE notifications SET read = TRUE");
  res.json({ message: "All notifications marked as read" });
});

router.delete("/:id", requireAuth("administrator"), async (req, res) => {
  await pool.query("DELETE FROM notifications WHERE id = $1", [req.params.id]);
  res.json({ message: "Notification deleted" });
});

module.exports = router;
