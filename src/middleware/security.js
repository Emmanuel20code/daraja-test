const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

function setupSecurity(app) {
  // Helmet security headers
  app.use(helmet({
    contentSecurityPolicy: false // disabled to allow CDN assets in admin dashboard
  }));

  // CORS
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
  }));

  // General rate limiter
  app.use("/api/", rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: "Too many requests, please try again later" }
  }));

  // Strict limiter for auth
  app.use("/api/auth/login", rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: "Too many login attempts" }
  }));

  // STK push limiter
  app.use("/api/portal/stkpush", rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many payment requests" }
  }));

  // Callback - no rate limit (Safaricom may retry)
  app.set("trust proxy", 1);
}

module.exports = { setupSecurity };
