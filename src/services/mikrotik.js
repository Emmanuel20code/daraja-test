const logger = require("../utils/logger");

// node-routeros is optional - gracefully disabled if not installed
let RouterOSAPI = null;
try {
  RouterOSAPI = require("node-routeros").RouterOSAPI;
  logger.info("node-routeros loaded - MikroTik direct API integration enabled");
} catch (e) {
  logger.warn("node-routeros not available - MikroTik direct API disabled. Heartbeat-based session management still works.");
}

/**
 * Check if RouterOS direct API is available.
 */
function isAvailable() {
  return RouterOSAPI !== null;
}

/**
 * Get a connected RouterOS API client.
 */
async function getClient(router) {
  if (!RouterOSAPI) {
    throw new Error("node-routeros not installed - direct router API unavailable");
  }
  const conn = new RouterOSAPI({
    host: router.ip_address,
    user: router.api_username || "admin",
    password: router.api_password || "",
    port: router.api_port || 8728,
    timeout: 15
  });
  await conn.connect();
  return conn;
}

/**
 * Add a hotspot user with bandwidth limits and time limit.
 */
async function addHotspotUser(router, { username, password = "", profile = "default", timeLimit, macAddress }) {
  const conn = await getClient(router);
  try {
    const params = [
      `=name=${username}`,
      `=password=${password}`,
      `=profile=${profile}`
    ];
    if (timeLimit) params.push(`=limit-uptime=${timeLimit}`);
    if (macAddress) params.push(`=mac-address=${macAddress}`);
    await conn.write("/ip/hotspot/user/add", params);
    logger.info("MikroTik: hotspot user added", { router: router.name, username });
  } finally {
    await conn.close().catch(() => {});
  }
}

/**
 * Remove a hotspot user.
 */
async function removeHotspotUser(router, username) {
  const conn = await getClient(router);
  try {
    const users = await conn.write("/ip/hotspot/user/print", [`?name=${username}`]);
    if (users.length > 0) {
      await conn.write("/ip/hotspot/user/remove", [`=.id=${users[0][".id"]}`]);
      logger.info("MikroTik: hotspot user removed", { router: router.name, username });
    }
  } finally {
    await conn.close().catch(() => {});
  }
}

/**
 * Disconnect an active hotspot session.
 */
async function disconnectActiveUser(router, username) {
  const conn = await getClient(router);
  try {
    const active = await conn.write("/ip/hotspot/active/print", [`?user=${username}`]);
    for (const session of active) {
      await conn.write("/ip/hotspot/active/remove", [`=.id=${session[".id"]}`]);
    }
    logger.info("MikroTik: active session disconnected", { router: router.name, username });
  } finally {
    await conn.close().catch(() => {});
  }
}

/**
 * Get list of active hotspot users from router.
 */
async function getActiveUsers(router) {
  const conn = await getClient(router);
  try {
    const active = await conn.write("/ip/hotspot/active/print");
    return active.map(u => ({
      username: u.user,
      ip: u.address,
      mac: u["mac-address"],
      uptime: u.uptime,
      bytesIn: u["bytes-in"],
      bytesOut: u["bytes-out"]
    }));
  } finally {
    await conn.close().catch(() => {});
  }
}

/**
 * Add bandwidth profile on router.
 */
async function ensureBandwidthProfile(router, { name, downloadSpeed, uploadSpeed }) {
  const conn = await getClient(router);
  try {
    const existing = await conn.write("/ip/hotspot/user/profile/print", [`?name=${name}`]);
    if (existing.length === 0) {
      await conn.write("/ip/hotspot/user/profile/add", [
        `=name=${name}`,
        `=rate-limit=${uploadSpeed}M/${downloadSpeed}M`
      ]);
      logger.info("MikroTik: bandwidth profile created", { router: router.name, name });
    }
  } finally {
    await conn.close().catch(() => {});
  }
}

/**
 * Get router system info.
 * NOTE: bracket notation used for hyphenated keys ("board-name") to avoid syntax errors.
 */
async function getSystemInfo(router) {
  const conn = await getClient(router);
  try {
    const [identity, resource, routerboard] = await Promise.all([
      conn.write("/system/identity/print"),
      conn.write("/system/resource/print"),
      conn.write("/system/routerboard/print").catch(() => [])
    ]);
    const res = resource[0] || {};
    const rb = routerboard[0] || {};
    return {
      name: (identity[0] && identity[0].name) || router.name,
      version: res["version"] || null,
      model: rb["board-name"] || res["board"] || null,
      uptime: res["uptime"] || null,
      cpuLoad: parseInt(res["cpu-load"]) || 0,
      freeMemory: parseInt(res["free-memory"]) || 0
    };
  } finally {
    await conn.close().catch(() => {});
  }
}

module.exports = {
  addHotspotUser,
  removeHotspotUser,
  disconnectActiveUser,
  getActiveUsers,
  ensureBandwidthProfile,
  getSystemInfo,
  getClient,
  isAvailable
};
