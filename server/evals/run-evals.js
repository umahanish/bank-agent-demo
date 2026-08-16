// Runner for server/evals/eval-suite.js. Prints a pass/fail report and
// exits non-zero if anything fails, so it's CI-friendly.

const { randomUUID } = require("node:crypto");
const { cases, costTracker } = require("./eval-suite");
const coordinator = require("../agents/coordinator-agent");
const { startTrace, getTrace } = require("../observability/tracer");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — evals make real model calls. Copy .env.example to .env first.");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const testCase of cases) {
    const requestId = randomUUID();
    const sessionId = `eval-${requestId}`;
    const tracer = startTrace(requestId, { evalCase: testCase.name });
    const callBudget = { count: 0 };

    if (testCase.setup) testCase.setup();

    try {
      const result = await coordinator.handleTurn({
        userText: testCase.userText,
        userId: testCase.userId,
        stepUpVerified: false,
        costTracker,
        sessionId,
        tracer,
        callBudget,
        conversationHistory: []
      });
      tracer.finish({ outcome: "eval_complete" });

      const trace = getTrace(requestId);
      testCase.assert(trace, result);
      console.log(`PASS  ${testCase.name}`);
      passed++;
    } catch (err) {
      console.log(`FAIL  ${testCase.name}`);
      console.log(`      ${err.message}`);
      failed++;
    } finally {
      if (testCase.teardown) testCase.teardown();
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
