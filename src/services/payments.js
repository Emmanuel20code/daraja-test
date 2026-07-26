const express = require('express');
const router = express.Router();
const { stkPush, stkPushQuery } = require('../services/mpesa-service');  // <-- adjust if you used a different name
const logger = require('../utils/logger');

// =====================================================
// TODO: Replace these 3 functions with your actual DB code
// =====================================================
async function createPaymentRecord(data) {
  // Replace with: await Payment.create(data)
  return { id: Date.now(), ...data, update: async (updates) => { console.log('Update:', updates); } };
}
async function findPaymentByCheckoutID(id) {
  // Replace with: await Payment.findOne({ where: { checkoutRequestID: id } })
  return null;
}
async function enableCustomerService(customerId) {
  // Replace with: await Customer.update({ active: true }, { where: { id: customerId } })
  logger.info('Enable service for:', customerId);
}
// =====================================================

// ---------- Initiate STK Push ----------
router.post('/mpesa/initiate', async (req, res) => {
  const { phone, amount, accountRef, description } = req.body;

  if (!phone || !/^2547\d{8}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone must be 2547XXXXXXXX' });
  }
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const payment = await createPaymentRecord({ phone, amount, accountRef, status: 'pending' });
    const response = await stkPush({ phone, amount, accountRef, transactionDesc: description || 'WiFi' });
    await payment.update({ checkoutRequestID: response.CheckoutRequestID });

    res.json({ success: true, checkoutRequestID: response.CheckoutRequestID, message: 'STK Push sent' });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- M-PESA Callback (Safaricom calls this) ----------
exports.mpesaCallback = async (req, res) => {
  try {
    const { Body } = req.body;
    if (!Body) return res.status(400).json({ error: 'Invalid' });

    const { stkCallback } = Body;
    const checkoutID = stkCallback?.CheckoutRequestID;
    const resultCode = stkCallback?.ResultCode;
    const resultDesc = stkCallback?.ResultDesc;

    const payment = await findPaymentByCheckoutID(checkoutID);
    if (!payment) return res.status(200).json({ ResultCode: 0 });

    if (resultCode === '0') {
      const items = stkCallback?.CallbackMetadata?.Item || [];
      const get = (name) => items.find(i => i.Name === name)?.Value;
      await payment.update({ status: 'completed', transactionId: get('MpesaReceiptNumber'), amount: get('Amount') });
      if (payment.customerId) await enableCustomerService(payment.customerId);
    } else {
      await payment.update({ status: 'failed', resultDesc });
    }

    res.status(200).json({ ResultCode: 0 });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
};

// ---------- Query Status ----------
router.post('/mpesa/query', async (req, res) => {
  try {
    const result = await stkPushQuery(req.body.checkoutRequestID);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
