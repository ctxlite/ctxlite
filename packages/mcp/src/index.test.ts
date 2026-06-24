import { describe, it, expect } from "vitest"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// Black-box test against the built MCP binary — index.ts calls main() at module
// load and connects a real stdio transport, so it can't be imported directly
// under a test runner. Spawning the actual dist/index.js and watching its
// startup line on stderr is the non-invasive way to confirm it boots cleanly.
const DIST_ENTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js")

function waitForStderrLine(child: ReturnType<typeof spawn>, match: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ""
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${match}". Got: ${buffer}`)), timeoutMs)
    child.stderr?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString()
      if (buffer.includes(match)) {
        clearTimeout(timer)
        resolve(buffer)
      }
    })
  })
}

describe("mcp server entrypoint (dist/index.js)", () => {
  it("starts and logs the stdio-running message without crashing", async () => {
    const child = spawn(process.execPath, [DIST_ENTRY], { stdio: ["pipe", "pipe", "pipe"] })
    try {
      const output = await waitForStderrLine(child, "[ctxlite] MCP server running on stdio")
      expect(output).toContain("running on stdio")
    } finally {
      child.kill()
    }
  })
})
