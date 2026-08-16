const { getUserById } = require("../mock-data/bank-db");

const TOOLS = [
  {
    name: "transaction_details",
    description: "Get the customer's recent transaction history.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "statement_request",
    description: "Request an account statement be generated and emailed to the customer.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", description: "e.g. 'last month', 'last 3 months'" } }
    }
  }
];

async function callTool(name, input, ctx) {
  const user = getUserById(ctx.userId);
  if (!user) return "Could not find an account for this customer.";

  switch (name) {
    case "transaction_details":
      if (!user.transactions.length) return "No recent transactions found.";
      return user.transactions
        .map(t => `${t.date}: ${t.desc} ${t.amount > 0 ? "+" : ""}${t.amount}`)
        .join("\n");
    case "statement_request":
      return `Statement request submitted for ${input.period || "the requested period"}. It will be emailed to the customer's registered address within 24 hours.`;
    default:
      return `Unknown tool: ${name}`;
  }
}

module.exports = { TOOLS, callTool };
