// Step 5 — "Accounts MCP Server"
//
// Why this file exists instead of the Accounts Agent calling the balance
// API directly: if a tool's integration details change (auth header,
// endpoint, error shape), only this file changes. The agent still just
// sees "balance_enquiry(input) -> string". That's the loose coupling the
// doc calls out — no tool-specific branching baked into agent code.
//
// A real deployment would run this as an actual MCP server (stdio or SSE
// transport, using @modelcontextprotocol/sdk) that the agent process
// connects to. Here it's an in-process module with the same tool-shaped
// interface, which keeps the demo runnable with zero extra infrastructure
// while preserving the abstraction boundary.

const { getUserById } = require("../mock-data/bank-db");

const TOOLS = [
  {
    name: "balance_enquiry",
    description: "Get the logged-in customer's current account balance.",
    input_schema: { type: "object", properties: {} }
  }
];

async function callTool(name, input, ctx) {
  const user = getUserById(ctx.userId);
  if (!user) return "Could not find an account for this customer.";

  switch (name) {
    case "balance_enquiry":
      return `Account ${user.account.accountNumber}: balance is ${user.account.currency} ${user.account.balance.toFixed(2)}.`;
    default:
      return `Unknown tool: ${name}`;
  }
}

module.exports = { TOOLS, callTool };
