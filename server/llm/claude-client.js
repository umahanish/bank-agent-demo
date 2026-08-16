// Thin wrapper around the Anthropic Messages API. This plays the role of
// "Third-party LLM" in Step 10's hybrid strategy. Every call is metered by
// the cost tracker and written to the trace, satisfying Steps 12 & 13.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const API_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude({ system, messages, tools, maxTokens = 600 }) {
  if (!API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key from console.anthropic.com."
    );
  }

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages
  };
  if (tools && tools.length) body.tools = tools;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  return res.json();
}

module.exports = { callClaude, MODEL };
