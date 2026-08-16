const { runSubAgent } = require("./agent-runtime");
const mcpServer = require("../mcp/transactions-mcp-server");

const SYSTEM_PROMPT = `You are the Transaction Agent for Brightly Bank, a domain-specific sub-agent (Step 3).
You handle transaction history and statement requests, using the transaction_details and statement_request tools.
Speak in a warm, human, conversational tone. Keep replies short and specific (dates, amounts).
If asked about anything outside transactions/statements, say so briefly so the Coordinator can route it elsewhere.`;

async function run(ctx) {
  return runSubAgent({
    agentName: "transaction_agent",
    systemPrompt: SYSTEM_PROMPT,
    mcpServer,
    ...ctx
  });
}

module.exports = { run, mcpServer, name: "transaction_agent" };
