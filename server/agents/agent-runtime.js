// The engine every domain sub-agent (Accounts, Transaction, Service) runs
// on. This is where Steps 5-13 all actually intersect on a single tool call:
//
//   LLM wants to call a tool
//     -> Step 7  authorize.checkAuthorization()   (policy, before execution)
//     -> if step-up needed        -> pause, ask for OTP
//     -> if human approval needed -> enqueue, tell the user it's pending
//     -> else                     -> Step 5  MCP server executes the tool
//     -> Step 12 tracer logs every branch
//     -> Step 13 cost tracker meters every LLM call & caps the loop
//
// A "sub-agent" in this file is just: { name, systemPrompt, mcpServer }.

const { routedLLMCall } = require("../llm/llm-router");
const { checkAuthorization } = require("../auth/authorize");
const approvalQueue = require("../approvals/approval-queue");
const { nameOf } = require("../mcp/index");
const { guardToolResult } = require("../security/prompt-injection-guard");

async function runSubAgent({
  agentName,
  systemPrompt,
  mcpServer,
  userText,
  userId,
  stepUpVerified,
  costTracker,
  sessionId,
  tracer,
  callBudget // { count, max } mutable shared object for loop protection across all agents this turn
}) {
  const messages = [{ role: "user", content: userText }];
  tracer.log(`${agentName}.start`, { userText });

  for (let turn = 0; turn < 4; turn++) {
    const loopCheck = costTracker.checkLoopLimit(callBudget.count);
    if (!loopCheck.ok) {
      tracer.log(`${agentName}.aborted`, loopCheck.reason);
      return { text: "I had to stop myself to avoid overusing resources — please try rephrasing your request.", pendingAuth: null };
    }

    callBudget.count += 1;
    const llmResult = await routedLLMCall({
      system: systemPrompt,
      messages,
      tools: mcpServer.TOOLS,
      maxTokens: 500,
      rawUserText: turn === 0 ? userText : "", // only the original user text is PII-checked; tool results are our own data
      tracer
    });

    if (llmResult.provider === "self-hosted") {
      // Hybrid strategy short-circuit: PII was present, so we never called
      // the third-party LLM for this content at all.
      costTracker.recordUsage(sessionId, { inputText: userText, outputText: llmResult.text });
      tracer.log(`${agentName}.self_hosted_reply`, llmResult.text);
      return { text: llmResult.text, pendingAuth: null };
    }

    const data = llmResult.data;
    costTracker.recordUsage(sessionId, {
      inputText: JSON.stringify(messages),
      outputText: JSON.stringify(data.content),
      usage: data.usage
    });

    const toolUseBlocks = (data.content || []).filter(b => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      const textBlock = (data.content || []).find(b => b.type === "text");
      const finalText = textBlock ? textBlock.text : "I wasn't able to generate a response.";
      tracer.log(`${agentName}.final_reply`, finalText);
      return { text: finalText, pendingAuth: null };
    }

    messages.push({ role: "assistant", content: data.content });
    const toolResults = [];

    for (const block of toolUseBlocks) {
      const auth = checkAuthorization({
        userId,
        toolName: block.name,
        input: block.input || {},
        stepUpVerified
      });
      tracer.log(`${agentName}.authorize`, { tool: block.name, input: block.input, decision: auth.decision, reason: auth.reason });

      if (auth.decision === "deny") {
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: auth.reason });
        continue;
      }

      if (auth.decision === "step_up_required") {
        // Pause the whole turn — the caller (coordinator-agent) surfaces an
        // OTP prompt and resumes this exact tool call once verified.
        tracer.log(`${agentName}.step_up_required`, block.name);
        return {
          text: null,
          pendingAuth: { agentName, mcpServerName: nameOf(mcpServer), toolName: block.name, input: block.input, userText }
        };
      }

      if (auth.decision === "approval_required") {
        const job = approvalQueue.enqueue({
          userId,
          sessionId,
          toolName: block.name,
          input: block.input,
          agentName
        });
        tracer.log(`${agentName}.approval_enqueued`, { approvalId: job.approvalId, reason: auth.reason });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `This request (${block.name}) has been submitted for manual approval (reference ${job.approvalId}) because it exceeds the customer's self-service limit. The customer will be notified once it's processed.`
        });
        continue;
      }

      // decision === "allow"
      const rawResult = await mcpServer.callTool(block.name, block.input || {}, { userId });
      // Tool output is untrusted data, not instructions — scan it before it
      // re-enters the model's context (see prompt-injection-guard.js).
      const result = guardToolResult(rawResult, { toolName: block.name, tracer, agentName });
      tracer.log(`${agentName}.tool_result`, { tool: block.name, result });
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { text: "I ran out of turns handling that — please try again.", pendingAuth: null };
}

function mcpServerName(mcpServer) {
  if (mcpServer === serviceMcp) return "service";
  return mcpServer.name || "unknown";
}

module.exports = { runSubAgent };
