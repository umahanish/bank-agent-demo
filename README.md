# Brightly Bank — Agentic Banking Chatbot Demo

A runnable, production-shaped reference implementation of the architecture in
*Bank-Chatbot.docx* — built for a student demo. It starts from 3 boxes (chat
UI → agent → LLM) and ends at the full 14-step diagram: multi-agent
coordination, MCP-style tools, auth vs. authz, session memory, hybrid LLM +
PII redaction, prompt-injection guardrails, evals, observability, cost
tracking, and human-in-the-loop approvals.

## Quick start

```bash
cd bank-agent-demo
npm install
cp .env.example .env
# edit .env and paste your key from https://console.anthropic.com
npm start
```

Open **http://localhost:3000**, pick **John** or **Sanjay**, and chat. Try:

- *"What's my balance?"* → routes to the Accounts Agent only.
- *"Get me my balance along with my last 5 transactions"* → Coordinator
  routes to **both** the Accounts Agent and Transaction Agent in parallel,
  then synthesizes one reply.
- *"Can you increase my credit limit to 500000?"* as **Sanjay** → denied
  immediately by policy (no permission) — this is **authorization**, not the
  model being polite.
- *"Can you increase my credit limit to 150000?"* as **John** → within his
  self-service ceiling, but still requires OTP step-up. Enter `232144` when
  asked.
- *"Can you increase my credit limit to 500000?"* as **John** → OTP step-up,
  then routes to **human approval** because it exceeds his self-service
  ceiling (see Approvals below).
- *"Can you increase my credit card limit to 500000, my card number is 1111
  2222 3333 44444"* → PII detector catches the card number and routes that
  turn to the **self-hosted** stub instead of the third-party LLM (hybrid
  strategy) — watch the terminal / trace to see the routing decision.

## Where each checklist item lives

| ✅ Checklist item | Files |
|---|---|
| Multi-agent design (Coordinator + domain sub-agents) | `server/agents/coordinator-agent.js`, `server/agents/{accounts,transaction,service}-agent.js`, `server/agents/agent-runtime.js` |
| MCP servers for tool abstraction | `server/mcp/*-mcp-server.js`, `server/mcp/index.js` |
| Authentication & Authorization (and why they're not the same) | `server/auth/authenticate.js` (Step 6) vs `server/auth/authorize.js` (Step 7) |
| Session management, conversation memory & inter-agent state | `server/db/session-store.js` |
| Hybrid LLM strategy — why PII never leaves the bank | `server/security/pii-redaction.js`, `server/llm/llm-router.js` |
| Prompt injection risks & guardrails (real attack scenario) | `server/security/prompt-injection-guard.js`, tested in `server/evals/eval-suite.js` |
| Agent evaluation pipelines | `server/evals/eval-suite.js`, `server/evals/run-evals.js` |
| Observability & tracing | `server/observability/tracer.js`, `GET /api/trace/:requestId` |
| Cost tracking & runaway-loop protection | `server/cost/cost-tracker.js` |
| Message queues, human-in-the-loop approval & async writes | `server/approvals/approval-queue.js`, `POST /api/approvals/:id/decision` |
| Production deployment, networking & failure handling | `server/security/edge-layer.js` + notes below |

## Running the eval suite

```bash
npm run evals
```

This runs six scripted conversations against the **real** coordinator and
asserts on *behavior* (which tools got called, whether authorization was
enforced, whether the injection guard fired) — not exact text, since LLM
output isn't deterministic. One test is a live demonstration of the doc's
regression scenario: `server/agents/service-agent.js` currently has the
*safe* system prompt (confirm the address before a cheque book request).
Try swapping in the doc's "improved" prompt —
`Submit the cheque book request using the customer's registered details.`
— and see how the eval suite (and the story you'd tell about why evals
matter) changes.

## Human-in-the-loop approvals

When a request needs manual sign-off, it's written to an in-memory queue
instead of executed synchronously:

```bash
# See what's pending
curl http://localhost:3000/api/approvals -H "Authorization: Bearer <token>"

# Approve or reject
curl -X POST http://localhost:3000/api/approvals/<approvalId>/decision \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"approve": true}'
```

In production this queue is a real broker (SQS/RabbitMQ/Kafka) and the
"approver" is a case-management UI for bank staff — the shape (enqueue →
pending → resolve → side effect) stays the same.

## Observability

Every request gets a `requestId`. Fetch its full trace — every routing
decision, tool call, authorization check, PII redaction, and injection
block — at:

```
GET /api/trace/:requestId
```

## What's simplified for the demo (and how to harden it for real use)

- **MCP servers are in-process modules**, not real MCP protocol servers over
  stdio/SSE. The tool-shaped interface (`TOOLS`, `callTool`) is the same
  shape a real `@modelcontextprotocol/sdk` server would expose — swapping in
  the real SDK is a contained change inside `server/mcp/`.
- **Session store, approval queue, and cost tracker are in-memory** (`Map`s).
  Swap for Redis/Postgres and a real broker for anything beyond a demo — the
  function signatures are deliberately small so this is a drop-in change.
- **The self-hosted LLM is a deterministic stub**, not a real on-prem model.
  It exists to make the hybrid-routing *decision* demonstrable without
  requiring a second model deployment for a classroom demo.
- **Edge layer** only implements rate limiting. A real deployment adds a WAF,
  DDoS protection, and API-gateway-level schema validation in front of this
  same Express app — none of which changes application code, which is the
  point of keeping them at the edge.
- **Failure handling**: add retries with backoff around `callClaude()` for
  transient API errors, and a circuit breaker if you're chaining multiple
  LLM calls per turn (this demo already caps loop length via
  `MAX_LLM_CALLS_PER_TURN`, which is the cheapest form of failure handling —
  bounding the blast radius of a confused agent).
