const axios = require("axios");
const moment = require("moment");
const logger = require("../utils/logger");

const MPESA_BASE_URL = process.env.MPESA_ENV === "sandbox"
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return response.data.access_token;
}

async function stkPush({ phone, amount, accountRef = "WiFi Payment", desc = "WiFi Package" }) {
  const token = await getAccessToken();
  const timestamp = moment().format("YYYYMMDDHHmmss");
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString("base64");

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerBuyGoodsOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: process.env.MPESA_SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: accountRef,
    TransactionDesc: desc
  };

  logger.info("STK Push initiated", { phone, amount });

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
}

async function queryStatus(checkoutRequestId) {
  const token = await getAccessToken();
  const timestamp = moment().format("YYYYMMDDHHmmss");
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString("base64");

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
}

module.exports = { getAccessToken, stkPush, queryStatus };
