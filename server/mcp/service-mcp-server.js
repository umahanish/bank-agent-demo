const { getUserById } = require("../mock-data/bank-db");

const TOOLS = [
  {
    name: "change_of_address",
    description: "Update the customer's mailing address on file.",
    input_schema: {
      type: "object",
      properties: { new_address: { type: "string" } },
      required: ["new_address"]
    }
  },
  {
    name: "cheque_book_request",
    description: "Request a new cheque book be mailed to the customer's registered address.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "kyc_update",
    description: "Start a KYC (Know Your Customer) document update request.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "increase_credit_limit",
    description: "Request an increase to the customer's credit card limit.",
    input_schema: {
      type: "object",
      properties: { new_limit: { type: "number" } },
      required: ["new_limit"]
    }
  }
];

// The regression example from the doc (Step 11 / Agent Evals) lives right
// here: the OLD system prompt told the agent to confirm the delivery
// address before submitting a cheque book request, because this function
// defaults to the address on file, which may be stale. The eval suite
// (server/evals/eval-suite.js) has a test that fails if a future prompt
// change causes the agent to skip that confirmation.
async function callTool(name, input, ctx) {
  const user = getUserById(ctx.userId);
  if (!user) return "Could not find an account for this customer.";

  switch (name) {
    case "change_of_address":
      user.address = input.new_address;
      return `Address updated on file to: ${input.new_address}`;
    case "cheque_book_request":
      return `New cheque book requested, to be delivered to: ${user.address}. Arrives in 5-7 business days.`;
    case "kyc_update":
      return `KYC update request started. A secure document-upload link has been sent to the customer's registered mobile number.`;
    case "increase_credit_limit":
      user.account.creditLimit = input.new_limit;
      return `Credit limit updated to ${user.account.currency} ${input.new_limit}.`;
    default:
      return `Unknown tool: ${name}`;
  }
}

module.exports = { TOOLS, callTool };
