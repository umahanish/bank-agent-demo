// Step 6 — Authentication: "Who are you?"
//
// The bank's identity provider issues a JWT after login. This middleware
// only answers ONE question: is this a valid, unexpired token, and who does
// it belong to? It says nothing about what that person is allowed to do —
// that's Step 7 (authorization.js), a deliberately separate concern.

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "demo-secret-change-me";

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token. Log in via POST /api/auth/login first." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId, username: payload.username, role: payload.role };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

function issueToken(user) {
  return jwt.sign(
    { userId: user.userId, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

module.exports = { authenticate, issueToken, JWT_SECRET };
