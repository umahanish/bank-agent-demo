// Step 13 — "A bill that tripled"
//
// Two failure modes this guards against:
//  1. Cost creep: every LLM call (coordinator, each sub-agent, synthesis)
//     costs money. Multiply by 4.2 lakh calls/month and a silent per-turn
//     regression (e.g. an agent that calls a tool in a retry loop) becomes a
//     real line item on the bill.
//  2. Runaway loops: a confused agent can call the same tool over and over.
//     We cap LLM calls per user turn — not just per session — so one bad
//     turn can't spiral.

// Rough $/1K-token estimate for the demo model. Replace with the real
// pricing table for whatever model you deploy.
const PRICE_PER_1K_INPUT_TOKENS_USD = 0.003;
const PRICE_PER_1K_OUTPUT_TOKENS_USD = 0.015;

function estimateTokens(text) {
  // Cheap approximation (~4 chars/token) — good enough for a cost *signal*,
  // not for billing reconciliation. Use the API's real usage.{input,output}
  // fields when you have them (see recordUsage below).
  return Math.ceil((text || "").length / 4);
}

class CostTracker {
  constructor(budgetCents, maxLlmCallsPerTurn) {
    this.budgetCents = budgetCents;
    this.maxLlmCallsPerTurn = maxLlmCallsPerTurn;
    this.sessionCosts = new Map(); // sessionId -> cents spent (lifetime)
  }

  getSpendCents(sessionId) {
    return this.sessionCosts.get(sessionId) || 0;
  }

  // Call before starting a new turn's LLM pipeline.
  checkBudget(sessionId) {
    const spent = this.getSpendCents(sessionId);
    if (spent >= this.budgetCents) {
      return { ok: false, reason: `Session budget of ${this.budgetCents}c exhausted (spent ${spent}c).` };
    }
    return { ok: true };
  }

  // Loop protection: pass the running count of LLM calls made so far *this turn*.
  checkLoopLimit(callsSoFarThisTurn) {
    if (callsSoFarThisTurn >= this.maxLlmCallsPerTurn) {
      return { ok: false, reason: `Exceeded max ${this.maxLlmCallsPerTurn} LLM calls for a single turn — aborting to avoid a runaway loop.` };
    }
    return { ok: true };
  }

  // Record actual usage from an Anthropic API response when available,
  // otherwise fall back to the character-based estimate.
  recordUsage(sessionId, { inputText, outputText, usage }) {
    let inputTokens, outputTokens;
    if (usage && typeof usage.input_tokens === "number") {
      inputTokens = usage.input_tokens;
      outputTokens = usage.output_tokens;
    } else {
      inputTokens = estimateTokens(inputText);
      outputTokens = estimateTokens(outputText);
    }
    const costUsd =
      (inputTokens / 1000) * PRICE_PER_1K_INPUT_TOKENS_USD +
      (outputTokens / 1000) * PRICE_PER_1K_OUTPUT_TOKENS_USD;
    const costCents = costUsd * 100;
    const prev = this.getSpendCents(sessionId);
    this.sessionCosts.set(sessionId, prev + costCents);
    return { inputTokens, outputTokens, costCents };
  }
}

module.exports = { CostTracker };
