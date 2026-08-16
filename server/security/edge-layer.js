// Step 14 — Edge Layer Security
//
// Everything below (coordinator, sub-agents, MCP servers) assumes it's only
// ever called by legitimate, reasonably-paced traffic. That assumption is
// enforced HERE, before a request ever reaches the API/coordinator layer —
// exactly like a WAF + API gateway sitting in front of a real deployment.
//
// This demo implements the piece that's meaningful to show without real
// infrastructure (rate limiting) and documents the rest.

const rateLimit = require("express-rate-limit");

const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 chat requests/minute/IP — generous for a demo, tight enough to show intent
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down (edge-layer rate limit)." }
});

// In production this middleware sits alongside:
//  - WAF rules (block SQLi/XSS payloads, known bad IP ranges)
//  - DDoS protection (upstream, e.g. Cloudflare/AWS Shield)
//  - API gateway (auth token shape validation, request size limits, schema
//    validation before the request touches application code)
function requestHygiene(req, res, next) {
  const MAX_BODY_CHARS = 4000;
  if (req.body && req.body.message && req.body.message.length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: "Message too long." });
  }
  next();
}

module.exports = { chatRateLimiter, requestHygiene };
