// Step 8 — Session Management
//
// Solves exactly the bug shown in the doc: "Was that the one I flagged as
// suspicious last week?" failing because nothing remembered the earlier
// turn. A session holds:
//   - conversationHistory: the raw user/assistant turns (for the LLM's own
//     context window)
//   - sharedState: facts sub-agents write for each other to read, so e.g.
//     the Transaction Agent's answer can inform the Service Agent without
//     re-deriving it from scratch
//   - pendingAuth: an in-flight step-up-auth (OTP) challenge, if any
//
// In-memory Map for the demo. Swap for Redis/Postgres in production — the
// interface below is deliberately small so that's a drop-in change.

const fs = require("fs");
const path = require("path");

const sessions = new Map();

function getOrCreateSession(sessionId, userId) {
  const key = `${userId}:${sessionId}`;
  if (!sessions.has(key)) {
    sessions.set(key, {
      sessionId,
      userId,
      conversationHistory: [], // [{role, content}]
      sharedState: {}, // inter-agent shared state
      pendingAuth: null, // { toolName, input, agent, subRequest }
      createdAt: new Date().toISOString()
    });
  }
  return sessions.get(key);
}

function saveTurn(session, role, content) {
  session.conversationHistory.push({ role, content });
}

module.exports = { getOrCreateSession, saveTurn };
