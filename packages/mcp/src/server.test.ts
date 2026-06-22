import { describe, it, expect } from "vitest"
import { createServer } from "./server.js"

describe("createServer", () => {
  it("creates server without throwing", () => {
    expect(() => createServer()).not.toThrow()
  })

  it("returns McpServer instance", () => {
    const server = createServer()
    expect(server).toBeDefined()
    expect(typeof server.connect).toBe("function")
  })
})
