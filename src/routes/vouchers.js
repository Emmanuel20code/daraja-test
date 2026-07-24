const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { generateVoucherCode, calcExpiry } = require("../utils/helpers");
const { activatePayment } = require("../services/payment-activator");
const logger = require("../utils/logger");

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = "";
    if (status) { params.push(status); where = "WHERE v.status = $1"; }
    params.push(parseInt(limit), offset);
    const rows = await pool.query(
      `SELECT v.*, pk.name AS package_name, c.phone
       FROM vouchers v
       LEFT JOIN packages pk ON pk.id = v.package_id
       LEFT JOIN customers c ON c.id = v.customer_id
       ${where} ORDER BY v.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ vouchers: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate batch of vouchers
router.post("/generate", requireAuth("administrator", "manager"), async (req, res) => {
  try {
    const { package_id, quantity = 1, expires_at } = req.body;
    if (!package_id || quantity < 1 || quantity > 1000) {
      return res.status(400).json({ error: "package_id required; quantity 1-1000" });
    }
    const prefix = (await pool.query("SELECT value FROM settings WHERE key='voucher_prefix'")).rows[0]?.value || "EM";
    const batchId = `BATCH-${Date.now()}`;
    const codes = [];
    for (let i = 0; i < quantity; i++) {
      const code = generateVoucherCode(prefix);
      await pool.query(
        "INSERT INTO vouchers (code, package_id, batch_id, expires_at) VALUES ($1,$2,$3,$4)",
        [code, package_id, batchId, expires_at || null]
      );
      codes.push(code);
    }
    logger.info("Vouchers generated", { quantity, package_id, batchId });
    res.status(201).json({ message: `${quantity} vouchers generated`, batch_id: batchId, codes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
