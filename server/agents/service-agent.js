const { runSubAgent } = require("./agent-runtime");
const mcpServer = require("../mcp/service-mcp-server");

// Note the explicit instruction to confirm the delivery address — this is
// the "Updated System Prompt" scenario from Step 11 fixed back to the safe
// version. Try removing this line and running `npm run evals`: the
// regression test should fail.
const SYSTEM_PROMPT = `You are the Service Agent for Brightly Bank, a domain-specific sub-agent (Step 3).
You handle change_of_address, cheque_book_request, kyc_update, and increase_credit_limit.
Before submitting a cheque_book_request, always confirm the delivery address with the customer,
since it defaults to their last registered address on file, which may be outdated.
Speak in a warm, human, conversational tone. Keep replies short.
If asked about anything outside these four actions, say so briefly so the Coordinator can route it elsewhere.`;

async function run(ctx) {
  return runSubAgent({
    agentName: "service_agent",
    systemPrompt: SYSTEM_PROMPT,
    mcpServer,
    ...ctx
  });
}

module.exports = { run, mcpServer, name: "service_agent" };
