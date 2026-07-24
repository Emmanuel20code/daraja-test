require("dotenv").config();

const express = require("express");
const path = require("path");
const { setupSecurity } = require("./src/middleware/security");
const { initDb } = require("./src/db/schema");
const logger = require("./src/utils/logger");
const { startSessionMonitor } = require("./src/services/session-monitor");

const app = express();
const PORT = process.env.PORT || 3000;

setupSecurity(app);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// API Routes
app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/dashboard", require("./src/routes/dashboard"));
app.use("/api/packages", require("./src/routes/packages"));
app.use("/api/customers", require("./src/routes/customers"));
app.use("/api/devices", require("./src/routes/devices"));
app.use("/api/payments", require("./src/routes/payments"));
app.use("/api/routers", require("./src/routes/routers"));
app.use("/api/sessions", require("./src/routes/sessions"));
app.use("/api/vouchers", require("./src/routes/vouchers"));
app.use("/api/reports", require("./src/routes/reports"));
app.use("/api/logs", require("./src/routes/logs"));
app.use("/api/notifications", require("./src/routes/notifications"));
app.use("/api/settings", require("./src/routes/settings"));
app.use("/api/portal", require("./src/routes/portal"));
app.use("/connect", require("./src/routes/router-connect"));

// Legacy M-PESA callback - preserve existing URL
const paymentsRouter = require("./src/routes/payments");
app.post("/callback", paymentsRouter.mpesaCallback);

// Admin SPA
app.get("/admin*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// 404 for unknown API
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error", { error: err.message, url: req.url });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message
  });
});

async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      logger.info(`EMMATECH WiFi Billing running on port ${PORT}`);
      startSessionMonitor();
    });
  } catch (err) {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  }
}

start();
