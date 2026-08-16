// Step 7 — Authorization: "What are you allowed to do?"
//
// This is the piece that makes John's and Sanjay's credit-limit requests
// come out differently even though both are authenticated the exact same
// way. The policy check happens BEFORE the tool executes, in the agent's
// tool-call loop — never rely on the LLM to "decide" not to call a tool it
// isn't allowed to call. Treat the model as untrusted and enforce policy in
// code.

const { getUserById } = require("../mock-data/bank-db");

// Tool-level policy table. Extend this as new tools are added to the MCP
// servers — every sensitive tool should have an explicit entry here rather
// than defaulting to "allowed".
const POLICY = {
  balance_enquiry: { requiresStepUp: false, requiresApprovalAbove: null, permission: null },
  transaction_details: { requiresStepUp: false, requiresApprovalAbove: null, permission: null },
  statement_request: { requiresStepUp: false, requiresApprovalAbove: null, permission: null },
  change_of_address: { requiresStepUp: true, requiresApprovalAbove: null, permission: null },
  cheque_book_request: { requiresStepUp: false, requiresApprovalAbove: null, permission: null },
  kyc_update: { requiresStepUp: true, requiresApprovalAbove: null, permission: null },
  increase_credit_limit: {
    requiresStepUp: true,
    permission: "credit_limit_self_service",
    // Amounts at or below the user's self-service ceiling can be approved
    // automatically once step-up auth passes. Above it, a human has to sign
    // off (Step 15 — human-in-the-loop).
    requiresApprovalAboveUserCeiling: true
  }
};

// Returns one of: "allow", "deny", "step_up_required", "approval_required"
function checkAuthorization({ userId, toolName, input, stepUpVerified }) {
  const rule = POLICY[toolName];
  if (!rule) return { decision: "allow" }; // unknown tool = no special policy for the demo

  const user = getUserById(userId);
  if (rule.permission && !user.permissions.includes(rule.permission)) {
    return {
      decision: "deny",
      reason: `${user.name} does not have permission for '${toolName}'. Please contact customer support.`
    };
  }

  if (rule.requiresStepUp && !stepUpVerified) {
    return { decision: "step_up_required", reason: "This action requires OTP verification." };
  }

  if (toolName === "increase_credit_limit" && rule.requiresApprovalAboveUserCeiling) {
    const requested = Number(input.new_limit || 0);
    if (requested > user.selfServiceCreditLimitMax) {
      return {
        decision: "approval_required",
        reason: `Requested limit ${requested} exceeds ${user.name}'s self-service ceiling of ${user.selfServiceCreditLimitMax}; routing to human approval.`
      };
    }
  }

  return { decision: "allow" };
}

module.exports = { checkAuthorization, POLICY };
