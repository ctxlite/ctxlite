#!/usr/bin/env node
// CRITICAL: Never use console.log() — stdout is reserved for MCP JSON-RPC
// Use console.error() for logging — writes to stderr

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "./server.js"

async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()

  await server.connect(transport)

  console.error("[ctxlite] MCP server running on stdio")
}

main().catch((err: unknown) => {
  console.error("[ctxlite] Fatal error:", err)
  process.exit(1)
})
