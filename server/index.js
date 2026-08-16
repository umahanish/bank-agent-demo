require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { randomUUID } = require("node:crypto");
const path = require("path");

const { chatRateLimiter, requestHygiene } = require("./security/edge-layer");
const { authenticate, issueToken } = require("./auth/authenticate");
const { checkAuthorization } = require("./auth/authorize");
const { getUser, DEMO_OTP } = require("./mock-data/bank-db");
const { getOrCreateSession, saveTurn } = require("./db/session-store");
const { CostTracker } = require("./cost/cost-tracker");
const { startTrace, getTrace, listTraces } = require("./observability/tracer");
const coordinator = require("./agents/coordinator-agent");
const approvalQueue = require("./approvals/approval-queue");
const mcpRegistry = require("./mcp/index");
const { guardToolResult } = require("./security/prompt-injection-guard");

const PORT = process.env.PORT || 3000;
const SESSION_BUDGET_CENTS = Number(process.env.SESSION_BUDGET_CENTS || 50);
const MAX_LLM_CALLS_PER_TURN = Number(process.env.MAX_LLM_CALLS_PER_TURN || 8);

const costTracker = new CostTracker(SESSION_BUDGET_CENTS, MAX_LLM_CALLS_PER_TURN);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------------------------------------------------------------------------
// Step 6 — Authentication ("Bank's identity provider")
// ---------------------------------------------------------------------------
app.post("/api/auth/login", (req, res) => {
  const { username } = req.body || {};
  const user = getUser((username || "").toLowerCase());
  if (!user) {
    return res.status(401).json({ error: "Unknown demo user. Try 'john' or 'sanjay'." });
  }
  const token = issueToken({ userId: user.userId, username, role: user.role });
  res.json({ token, user: { name: user.name, username, role: user.role } });
});

// ---------------------------------------------------------------------------
// Chat endpoint — Edge Layer -> Auth -> Session -> Coordinator -> Sub-agents
// ---------------------------------------------------------------------------
app.post("/api/chat", chatRateLimiter, requestHygiene, authenticate, async (req, res) => {
  const { sessionId, message } = req.body || {};
  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId and message are required." });
  }

  const requestId = randomUUID();
  const tracer = startTrace(requestId, { userId: req.user.userId, sessionId });
  const session = getOrCreateSession(sessionId, req.user.userId);

  // Step 13 — refuse to even start a turn if the session budget is spent.
  const budgetCheck = costTracker.checkBudget(sessionId);
  if (!budgetCheck.ok) {
    tracer.log("budget.exceeded", budgetCheck.reason);
    tracer.finish({ outcome: "budget_exceeded" });
    return res.status(429).json({ error: budgetCheck.reason, requestId });
  }

  saveTurn(session, "user", message);
  const callBudget = { count: 0 };

  try {
    // -----------------------------------------------------------------
    // Resuming a step-up auth (OTP) challenge from a previous turn
    // -----------------------------------------------------------------
    if (session.pendingAuth) {
      const pending = session.pendingAuth;
      const otpAttempt = message.trim();

      if (otpAttempt !== DEMO_OTP) {
        tracer.log("step_up.otp_failed", { attempt: otpAttempt });
        tracer.finish({ outcome: "otp_failed" });
        const reply = "That OTP doesn't match. Please double check and re-enter the code sent to your registered mobile.";
        saveTurn(session, "assistant", reply);
        return res.json({ reply, requestId });
      }

      tracer.log("step_up.otp_verified", { tool: pending.toolName });
      session.pendingAuth = null;

      // Re-run authorization now that step-up is verified (covers the
      // "approval_required" path even after OTP success, e.g. John
      // requesting an amount above his self-service ceiling).
      const authAfterOtp = checkAuthorization({
        userId: req.user.userId,
        toolName: pending.toolName,
        input: pending.input,
        stepUpVerified: true
      });
      tracer.log("step_up.reauthorize", authAfterOtp);

      let reply;
      if (authAfterOtp.decision === "approval_required") {
        const job = approvalQueue.enqueue({
          userId: req.user.userId,
          sessionId,
          toolName: pending.toolName,
          input: pending.input,
          agentName: pending.agentName
        });
        reply = `Thanks, you're verified. This request exceeds your self-service limit, so I've submitted it for manual approval (reference ${job.approvalId}). You'll be notified once it's processed.`;
      } else if (authAfterOtp.decision === "deny") {
        reply = authAfterOtp.reason;
      } else {
        const mcpServer = mcpRegistry.registry[pending.mcpServerName];
        const rawResult = await mcpServer.callTool(pending.toolName, pending.input, { userId: req.user.userId });
        const result = guardToolResult(rawResult, { toolName: pending.toolName, tracer, agentName: pending.agentName });
        tracer.log("step_up.tool_executed", { tool: pending.toolName, result });
        reply = `All set — ${result}`;
      }

      saveTurn(session, "assistant", reply);
      tracer.finish({ outcome: "step_up_resolved" });
      return res.json({ reply, requestId, costSoFarCents: costTracker.getSpendCents(sessionId) });
    }

    // -----------------------------------------------------------------
    // Normal turn — Coordinator routes to sub-agent(s)
    // -----------------------------------------------------------------
    const { reply, pendingAuth } = await coordinator.handleTurn({
      userText: message,
      userId: req.user.userId,
      stepUpVerified: false,
      costTracker,
      sessionId,
      tracer,
      callBudget,
      conversationHistory: session.conversationHistory
    });

    if (pendingAuth) {
      session.pendingAuth = pendingAuth;
    }

    saveTurn(session, "assistant", reply);
    tracer.finish({ outcome: pendingAuth ? "step_up_requested" : "answered", llmCalls: callBudget.count });
    res.json({ reply, requestId, costSoFarCents: costTracker.getSpendCents(sessionId), llmCallsThisTurn: callBudget.count });
  } catch (err) {
    tracer.log("error", { message: err.message });
    tracer.finish({ outcome: "error" });
    console.error(err);
    res.status(500).json({ error: err.message, requestId });
  }
});

// ---------------------------------------------------------------------------
// Human-in-the-loop approvals (a real back office would have a UI over this)
// ---------------------------------------------------------------------------
app.get("/api/approvals", authenticate, (req, res) => {
  res.json({ pending: approvalQueue.listPending() });
});

app.post("/api/approvals/:id/decision", authenticate, async (req, res) => {
  const { approve } = req.body || {};
  const job = await approvalQueue.decide(req.params.id, !!approve, async job => {
    const mcpServer = mcpRegistry.registry.service; // credit-limit increases live in the service MCP server
    return mcpServer.callTool(job.toolName, job.input, { userId: job.userId });
  });
  if (!job) return res.status(404).json({ error: "Approval not found." });
  res.json({ job });
});

// ---------------------------------------------------------------------------
// Observability & cost endpoints (Steps 12 & 13)
// ---------------------------------------------------------------------------
app.get("/api/trace/:requestId", authenticate, (req, res) => {
  const trace = getTrace(req.params.requestId);
  if (!trace) return res.status(404).json({ error: "Trace not found." });
  res.json(trace);
});

app.get("/api/traces", authenticate, (req, res) => {
  res.json({ traces: listTraces(30) });
});

app.get("/api/cost/:sessionId", authenticate, (req, res) => {
  res.json({ sessionId: req.params.sessionId, spentCents: costTracker.getSpendCents(req.params.sessionId), budgetCents: SESSION_BUDGET_CENTS });
});

app.listen(PORT, () => {
  console.log(`Brightly Bank agentic demo running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("WARNING: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  }
});
