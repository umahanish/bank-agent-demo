// Human-in-the-loop approval & async writes
//
// Some actions (a large credit-limit increase) should never be executed
// synchronously just because an LLM decided to call a tool. This module
// models that as a queue: the agent enqueues a job and immediately tells
// the customer their request is pending, instead of blocking the chat
// response on a human. A separate "worker" (here: an admin hitting the
// approve/reject endpoint) drains the queue asynchronously.
//
// In production this queue would be a real message broker (SQS/RabbitMQ/
// Kafka) and the "worker" would be a case-management UI for bank staff.
// The in-memory array below preserves the same shape: enqueue -> pending ->
// resolve -> side effect.

const { randomUUID } = require("node:crypto");

const queue = new Map(); // approvalId -> job

function enqueue(job) {
  const approvalId = randomUUID();
  const record = {
    approvalId,
    status: "pending", // pending | approved | rejected
    createdAt: new Date().toISOString(),
    ...job
  };
  queue.set(approvalId, record);
  return record;
}

function listPending() {
  return Array.from(queue.values()).filter(j => j.status === "pending");
}

function get(approvalId) {
  return queue.get(approvalId) || null;
}

// resolver(job) is called with the side effect to run once approved —
// e.g. actually writing the new credit limit via the Service MCP server.
async function decide(approvalId, approve, resolver) {
  const job = queue.get(approvalId);
  if (!job) return null;
  if (job.status !== "pending") return job;

  job.status = approve ? "approved" : "rejected";
  job.decidedAt = new Date().toISOString();

  if (approve && resolver) {
    job.result = await resolver(job);
  }
  return job;
}

module.exports = { enqueue, listPending, get, decide };
