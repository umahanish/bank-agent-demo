const { runSubAgent } = require("./agent-runtime");
const mcpServer = require("../mcp/accounts-mcp-server");

const SYSTEM_PROMPT = `You are the Accounts Agent for Brightly Bank, a domain-specific sub-agent (Step 3).
You handle ONLY balance-related requests, using the balance_enquiry tool.
Speak in a warm, human, conversational tone. Keep replies short (1-2 sentences).
If asked about anything outside balances, say so briefly so the Coordinator can route it elsewhere.`;

async function run(ctx) {
  return runSubAgent({
    agentName: "accounts_agent",
    systemPrompt: SYSTEM_PROMPT,
    mcpServer,
    ...ctx
  });
}

module.exports = { run, mcpServer, name: "accounts_agent" };
