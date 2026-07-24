const moment = require("moment");

/**
 * Parse package duration string into milliseconds.
 * Supports: 1h, 3h, 24h, 1d, 3d, 7d, 30d, 1w, 1m
 */
function parseDurationMs(duration) {
  const unit = duration.slice(-1).toLowerCase();
  const value = parseInt(duration.slice(0, -1), 10);
  const map = { h: 3600000, d: 86400000, w: 604800000, m: 2592000000 };
  return (map[unit] || 3600000) * value;
}

/**
 * Calculate expiry timestamp from now + duration string.
 */
function calcExpiry(duration) {
  return new Date(Date.now() + parseDurationMs(duration));
}

/**
 * Format Kenyan phone to 2547XXXXXXXX
 */
function formatPhone(phone) {
  let p = String(phone).replace(/\D/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  if (!p.startsWith("254")) p = "254" + p;
  return p;
}

/**
 * Generate random alphanumeric string
 */
function randomString(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Generate a voucher code with optional prefix
 */
function generateVoucherCode(prefix = "EM") {
  return prefix + randomString(8);
}

/**
 * Sanitise MAC address to uppercase colon-separated
 */
function normalizeMac(mac) {
  if (!mac) return null;
  return mac.replace(/[^a-fA-F0-9]/g, "").toUpperCase()
    .match(/.{1,2}/g)?.join(":") || null;
}

/**
 * Hotspot username from phone (last 9 digits)
 */
function phoneToUsername(phone) {
  const p = formatPhone(phone);
  return "user_" + p.slice(-9);
}

module.exports = { parseDurationMs, calcExpiry, formatPhone, randomString, generateVoucherCode, normalizeMac, phoneToUsername };
