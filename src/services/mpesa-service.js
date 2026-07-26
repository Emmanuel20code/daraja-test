const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  accessToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return accessToken;
}

async function stkPush({ phone, amount, accountRef, transactionDesc }) {
  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: phone,
    PartyB: process.env.MPESA_SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: accountRef.slice(0, 12),
    TransactionDesc: transactionDesc.slice(0, 13),
  };

  const res = await axios.post(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

async function stkPushQuery(checkoutRequestID) {
  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestID,
  };

  const res = await axios.post(`${BASE_URL}/mpesa/stkpushquery/v1/query`, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

module.exports = { stkPush, stkPushQuery };
