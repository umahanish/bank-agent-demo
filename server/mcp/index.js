const accounts = require("./accounts-mcp-server");
const transactions = require("./transactions-mcp-server");
const service = require("./service-mcp-server");

const registry = { accounts, transactions, service };

function nameOf(mcpServer) {
  return Object.keys(registry).find(key => registry[key] === mcpServer) || "unknown";
}

module.exports = { registry, nameOf };
