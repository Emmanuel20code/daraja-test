const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { activatePayment } = require("../services/payment-activator");
const logger = require("../utils/logger");

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = [];
    if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`p.phone ILIKE $${params.length}`); }
    const whereStr = where.length ? "WHERE " + where.join(" AND ") : "";
    params.push(parseInt(limit), offset);
    const rows = await pool.query(
      `SELECT p.*, pk.name AS package_name FROM payments p
       LEFT JOIN packages pk ON pk.id = p.package_id
       ${whereStr} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await pool.query(`SELECT COUNT(*) FROM payments p ${whereStr}`, params.slice(0, -2));
    res.json({ payments: rows.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth(), async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, pk.name AS package_name FROM payments p LEFT JOIN packages pk ON pk.id = p.package_id WHERE p.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Payment not found" });
  res.json({ payment: result.rows[0] });
});

// Manual retry activation
router.post("/:id/activate", requireAuth("administrator", "manager"), async (req, res) => {
  try {
    const result = await activatePayment(parseInt(req.params.id));
    res.json({ message: "Activation triggered", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// M-PESA callback (exported for use at /callback legacy route)
async function mpesaCallback(req, res) {
  try {
    const body = req.body;
    logger.info("M-PESA Callback received", { body: JSON.stringify(body) });

    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback) {
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    // Find payment
    const pmtRes = await pool.query(
      "SELECT * FROM payments WHERE checkout_request_id = $1",
      [checkoutRequestId]
    );
    if (!pmtRes.rows.length) {
      logger.warn("Callback for unknown checkout", { checkoutRequestId });
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
    const payment = pmtRes.rows[0];

    // Duplicate callback protection
    const dupCheck = await pool.query(
      "SELECT id FROM payment_callbacks WHERE checkout_request_id = $1 AND processed = TRUE",
      [checkoutRequestId]
    );
    if (dupCheck.rows.length) {
      logger.warn("Duplicate callback ignored", { checkoutRequestId });
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Store raw callback
    await pool.query(
      "INSERT INTO payment_callbacks (payment_id, checkout_request_id, raw_body, processed) VALUES ($1,$2,$3,TRUE)",
      [payment.id, checkoutRequestId, body]
    );

    if (resultCode === 0) {
      // Payment successful
      const items = stkCallback.CallbackMetadata?.Item || [];
      const receipt = items.find(i => i.Name === "MpesaReceiptNumber")?.Value || null;
      const amount = items.find(i => i.Name === "Amount")?.Value || payment.amount;

      await pool.query(
        `UPDATE payments SET status='paid', result_code=$1, result_description=$2,
         mpesa_receipt=$3, amount=$4, paid_at=NOW() WHERE id=$5`,
        [resultCode, resultDesc, receipt, amount, payment.id]
      );

      logger.info("Payment successful", { paymentId: payment.id, receipt, amount });

      // Activate internet asynchronously
      activatePayment(payment.id).catch(err =>
        logger.error("Async activation error", { paymentId: payment.id, error: err.message })
      );
    } else {
      // Payment failed
      await pool.query(
        "UPDATE payments SET status='failed', result_code=$1, result_description=$2 WHERE id=$3",
        [resultCode, resultDesc, payment.id]
      );
      logger.info("Payment failed", { paymentId: payment.id, resultCode, resultDesc });
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    logger.error("Callback processing error", { error: err.message });
    res.json({ ResultCode: 0, ResultDesc: "Accepted" }); // Always ack Safaricom
  }
}

// Also mount callback on /api/payments/callback
router.post("/callback", mpesaCallback);
router.mpesaCallback = mpesaCallback;

module.exports = router;
