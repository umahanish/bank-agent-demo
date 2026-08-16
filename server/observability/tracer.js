// Step 12 — "Where did my system go wrong?"
//
// A one-line access log ("request in, response out, HTTP 200") tells you
// NOTHING when a customer disputes a number. This module builds a structured,
// per-request trace: every prompt, every tool call, every routing decision,
// every LLM token estimate — so a support engineer can reconstruct exactly
// what the agent saw and did.
//
// In production this would ship to an OpenTelemetry collector / Langfuse /
// Datadog etc. For the demo we keep traces in memory and expose them via
// GET /api/trace/:requestId.

const traces = new Map(); // requestId -> trace object

function startTrace(requestId, meta) {
  const trace = {
    requestId,
    startedAt: new Date().toISOString(),
    meta,
    steps: []
  };
  traces.set(requestId, trace);
  return {
    log(step, detail) {
      trace.steps.push({ t: new Date().toISOString(), step, detail });
    },
    finish(summary) {
      trace.finishedAt = new Date().toISOString();
      trace.summary = summary;
    }
  };
}

function getTrace(requestId) {
  return traces.get(requestId) || null;
}

function listTraces(limit = 20) {
  return Array.from(traces.values())
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit)
    .map(t => ({ requestId: t.requestId, startedAt: t.startedAt, meta: t.meta, summary: t.summary }));
}

module.exports = { startTrace, getTrace, listTraces };
