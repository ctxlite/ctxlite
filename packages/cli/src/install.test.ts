import { describe, it, expect } from "vitest"
import { parseInstallArgs } from "./install.js"

describe("parseInstallArgs", () => {
  it("parses tool and scope flags", () => {
    const args = parseInstallArgs(["--tool", "cursor,opencode", "--scope", "project", "--yes"])
    expect(args.tools).toEqual(["cursor", "opencode"])
    expect(args.scope).toBe("project")
    expect(args.yes).toBe(true)
  })

  it("parses all tools", () => {
    const args = parseInstallArgs(["--tool", "all"])
    expect(args.tools).toHaveLength(4)
  })

  it("throws on unknown option", () => {
    expect(() => parseInstallArgs(["--wat"])).toThrow('Unknown option "--wat"')
  })
})
