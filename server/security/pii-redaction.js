// Step 9/10 — "The card number that shouldn't leave the building"
//
// The customer typed a raw card number in chat: "1111 2222 3333 44444".
// If that string goes straight into a prompt sent to a third-party LLM API,
// it has left the bank's infrastructure. This module:
//   1. Detects likely PII in outgoing text (card numbers, account numbers,
//      OTPs) with regexes — a real system would use a proper PII/NER model.
//   2. Redacts it before the text is allowed to reach callThirdPartyLLM().
//   3. Reports whether redaction happened, so the LLM router (llm-router.js)
//      can decide to use the self-hosted model instead for that turn.

const PII_PATTERNS = [
  { name: "card_number", regex: /\b(?:\d[ -]?){13,19}\b/g },
  { name: "otp_like", regex: /\b\d{6}\b/g }
];

function detectAndRedact(text) {
  if (!text) return { redactedText: text, piiFound: [] };
  let redactedText = text;
  const piiFound = [];

  for (const { name, regex } of PII_PATTERNS) {
    redactedText = redactedText.replace(regex, match => {
      piiFound.push({ type: name, sample: maskMiddle(match) });
      return `[REDACTED_${name.toUpperCase()}]`;
    });
  }
  return { redactedText, piiFound };
}

function maskMiddle(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return "••••";
  return `${digits.slice(0, 2)}••••••${digits.slice(-2)}`;
}

module.exports = { detectAndRedact };
