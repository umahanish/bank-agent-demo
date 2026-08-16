// Step 10 — Hybrid LLM strategy
//
// Route each call based on whether PII survived redaction:
//   - Clean text -> "third-party" LLM (Claude), which is where the real
//     language understanding happens in this demo.
//   - Text that still contains sensitive PII after redaction attempts (e.g.
//     something the regexes didn't catch, or a policy that says "never risk
//     it for this tool") -> "self-hosted" stub. In production this would be
//     a model the bank runs on its own infrastructure so the data never
//     crosses the network boundary. For the demo it's a small deterministic
//     function so the project runs without a second model.

const { callClaude } = require("./claude-client");
const { detectAndRedact } = require("../security/pii-redaction");

async function selfHostedLLM({ userText }) {
  // Deterministic stand-in for an on-prem model. Handles the narrow set of
  // intents that involve raw PII without ever letting that text leave the
  // building.
  const looksLikeCardNumber = /\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4,5}/.test(userText);
  if (looksLikeCardNumber) {
    return {
      text: "Thanks — I've securely noted the card details on file. For your protection I'll continue this step without sending that number anywhere else. Please confirm the OTP sent to your registered mobile.",
      provider: "self-hosted",
      usage: null
    };
  }
  return {
    text: "I've handled that locally without sending sensitive details externally. Could you tell me a bit more about what you need?",
    provider: "self-hosted",
    usage: null
  };
}

async function routedLLMCall({ system, messages, tools, maxTokens, rawUserText, tracer }) {
  const { redactedText, piiFound } = detectAndRedact(rawUserText || "");

  if (piiFound.length > 0) {
    tracer?.log("pii_redaction", { piiFound, routedTo: "self-hosted" });
    const result = await selfHostedLLM({ userText: rawUserText });
    return {
      provider: "self-hosted",
      textOnly: true,
      text: result.text,
      usage: null,
      redactedText
    };
  }

  tracer?.log("llm_route", { routedTo: "third-party", model: "claude" });
  const data = await callClaude({ system, messages, tools, maxTokens });
  return {
    provider: "third-party",
    textOnly: false,
    data,
    usage: data.usage,
    redactedText
  };
}

module.exports = { routedLLMCall, selfHostedLLM };
