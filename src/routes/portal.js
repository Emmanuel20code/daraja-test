const router = require("express").Router();
const pool = require("../db/pool");
const mpesa = require("../services/mpesa");
const { formatPhone } = require("../utils/helpers");
const logger = require("../utils/logger");

// GET /api/portal/packages - public
router.get("/packages", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, description, price, duration, download_speed, upload_speed, device_limit FROM packages WHERE active = TRUE ORDER BY display_order, price"
    );
    res.json({ packages: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load packages" });
  }
});

// GET /api/portal/branding - public
router.get("/branding", async (req, res) => {
  try {
    const [settings, org] = await Promise.all([
      pool.query("SELECT key, value FROM settings WHERE key IN ('brand_name','support_phone','support_email')"),
      pool.query("SELECT name, logo_url, primary_color, accent_color, support_phone FROM organizations LIMIT 1")
    ]);
    const s = {};
    for (const row of settings.rows) s[row.key] = row.value;
    res.json({ branding: { ...s, ...(org.rows[0] || {}) } });
  } catch (err) {
    res.status(500).json({ error: "Failed to load branding" });
  }
});

// POST /api/portal/stkpush - public
router.post("/stkpush", async (req, res) => {
  try {
    const { phone, packageId, mac_address, router_id } = req.body;
    if (!phone || !packageId) return res.status(400).json({ error: "Phone and packageId required" });

    const pkgRes = await pool.query("SELECT * FROM packages WHERE id = $1 AND active = TRUE", [packageId]);
    if (!pkgRes.rows.length) return res.status(404).json({ error: "Package not found" });
    const pkg = pkgRes.rows[0];

    const formattedPhone = formatPhone(phone);
    const amount = pkg.price;

    // Create pending payment
    const pmtRes = await pool.query(
      `INSERT INTO payments (phone, amount, package_id, device_mac, router_id, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
      [formattedPhone, amount, packageId, mac_address || null, router_id || null]
    );
    const paymentId = pmtRes.rows[0].id;

    // Initiate STK push
    const stkResp = await mpesa.stkPush({
      phone: formattedPhone,
      amount,
      accountRef: `WiFi-${pkg.name}`,
      desc: `EMMATECH WiFi - ${pkg.name}`
    });

    if (stkResp.ResponseCode !== "0") {
      await pool.query("UPDATE payments SET status='failed' WHERE id=$1", [paymentId]);
      return res.status(400).json({ error: stkResp.ResponseDescription || "STK Push failed" });
    }

    // Update with M-Pesa IDs
    await pool.query(
      "UPDATE payments SET merchant_request_id=$1, checkout_request_id=$2 WHERE id=$3",
      [stkResp.MerchantRequestID, stkResp.CheckoutRequestID, paymentId]
    );

    logger.info("STK Push sent", { paymentId, phone: formattedPhone, amount });
    res.json({
      message: "STK Push sent. Check your phone and enter M-PESA PIN.",
      checkoutRequestId: stkResp.CheckoutRequestID,
      paymentId
    });
  } catch (err) {
    logger.error("STK Push error", { error: err.message });
    res.status(500).json({ error: err.response?.data?.errorMessage || err.message || "Payment initiation failed" });
  }
});

// GET /api/portal/payment-status/:checkoutRequestId - public polling
router.get("/payment-status/:checkoutRequestId", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, status, mpesa_receipt, amount, paid_at FROM payments WHERE checkout_request_id = $1",
      [req.params.checkoutRequestId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Payment not found" });
    const pmt = result.rows[0];

    // If still pending after 30s, query Safaricom directly
    if (pmt.status === "pending") {
      try {
        const queryResp = await mpesa.queryStatus(req.params.checkoutRequestId);
        if (queryResp.ResultCode === 0) {
          // Successful
        } else if (queryResp.ResultCode !== undefined) {
          await pool.query("UPDATE payments SET status='failed', result_description=$1 WHERE id=$2",
            [queryResp.ResultDesc, pmt.id]);
          pmt.status = "failed";
        }
      } catch (_) {}
    }

    res.json({ status: pmt.status, receipt: pmt.mpesa_receipt, amount: pmt.amount, paidAt: pmt.paid_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portal/voucher/redeem - public
router.post("/voucher/redeem", async (req, res) => {
  try {
    const { code, mac_address, router_id } = req.body;
    if (!code) return res.status(400).json({ error: "Voucher code required" });

    const vRes = await pool.query(
      `SELECT v.*, pk.duration, pk.download_speed, pk.upload_speed, pk.name AS pkg_name
       FROM vouchers v JOIN packages pk ON pk.id = v.package_id
       WHERE v.code = $1 AND v.status = 'unused'
       AND (v.expires_at IS NULL OR v.expires_at > NOW())`,
      [code.toUpperCase().trim()]
    );
    if (!vRes.rows.length) return res.status(404).json({ error: "Invalid or expired voucher code" });

    const voucher = vRes.rows[0];
    await pool.query("UPDATE vouchers SET status='used', used_at=NOW() WHERE id=$1", [voucher.id]);

    // Create a synthetic "paid" payment and activate
    const pmtRes = await pool.query(
      `INSERT INTO payments (phone, amount, package_id, device_mac, router_id, status, mpesa_receipt, paid_at)
       VALUES ('voucher',0,$1,$2,$3,'paid',$4,NOW()) RETURNING id`,
      [voucher.package_id, mac_address || null, router_id || null, `VOUCHER-${code}`]
    );
    const { activatePayment } = require("../services/payment-activator");
    await activatePayment(pmtRes.rows[0].id);

    res.json({ message: `Voucher redeemed! ${voucher.pkg_name} activated.` });
  } catch (err) {
    logger.error("Voucher redeem error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
