import { describe, it, expect, afterAll, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-mcp-log-summary-home-"))
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { handleLogSummary } = await import("./log-summary.js")
const { closeSharedStores } = await import("@ctxlite/core")

afterAll(() => {
  closeSharedStores()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("handleLogSummary", () => {
  it("summarizes failures", async () => {
    const text = "[FAIL] test-one\nError: boom\n[INFO] ok\n"
    const result = await handleLogSummary({ text })
    expect(result).toContain("FAIL")
    expect(result).not.toContain("log_summary error")
  })

  it("returns error text for oversized input", async () => {
    const result = await handleLogSummary({ text: "x".repeat(1_048_577) })
    expect(result).toContain("log_summary error")
  })
})
