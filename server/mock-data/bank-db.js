// A fake "core banking system" — stands in for the real APIs the bank's
// internal MCP servers would call in production. Swap these functions'
// insides for real HTTP calls and nothing upstream needs to change —
// that's the point of putting an MCP server in front of them (Step 5).

const users = {
  john: {
    userId: "u1",
    name: "John",
    role: "customer",
    // Authorization ≠ Authentication (Step 6/7): John is *authenticated* the
    // same way any customer is, but his *authorization* policy allows
    // self-service credit-limit increases up to a threshold.
    permissions: ["credit_limit_self_service"],
    selfServiceCreditLimitMax: 200000,
    account: {
      accountNumber: "•••• 4821",
      balance: 84520.5,
      currency: "INR",
      creditLimit: 100000
    },
    transactions: [
      { date: "2026-08-14", desc: "Amazon", amount: -1200 },
      { date: "2026-08-12", desc: "Payroll deposit", amount: 65000 },
      { date: "2026-08-10", desc: "Electricity bill", amount: -2100 },
      { date: "2026-08-08", desc: "ATM withdrawal", amount: -5000 }
    ],
    address: "12 MG Road, Bengaluru, 560001"
  },
  sanjay: {
    userId: "u2",
    name: "Sanjay",
    role: "customer",
    // No self-service permission at all -> every increase request must be
    // declined with a clear reason, regardless of what the LLM "wants" to do.
    permissions: [],
    selfServiceCreditLimitMax: 0,
    account: {
      accountNumber: "•••• 7734",
      balance: 18200,
      currency: "INR",
      creditLimit: 50000
    },
    transactions: [
      { date: "2026-08-14", desc: "Amazon", amount: -1200 },
      { date: "2026-08-09", desc: "Netflix", amount: -649 }
    ],
    address: "44 Park Street, Kolkata, 700016"
  }
};

// Static demo OTP — a real bank's identity provider issues a fresh one per
// challenge over SMS. We fix it so the demo is reproducible.
const DEMO_OTP = "232144";

function getUser(username) {
  return users[username] || null;
}

function getUserById(userId) {
  return Object.values(users).find(u => u.userId === userId) || null;
}

module.exports = { users, getUser, getUserById, DEMO_OTP };
