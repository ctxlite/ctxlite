import { describe, it, expect } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  applyConfigChange,
  buildTargets,
  mergeMcpConfig,
  mergeOpenCodeConfig,
  mergeOpenCodeTuiConfig,
  planInstall,
  runInstall,
  MCP_SERVER_NAME,
  OPENCODE_PLUGIN,
} from "./index.js"

describe("mergeMcpConfig", () => {
  it("adds ctxlite server entry", () => {
    const { next, changed } = mergeMcpConfig({}, { command: "npx", args: ["-y", "@ctxlite/mcp"] })
    expect(changed).toBe(true)
    expect(next.mcpServers).toEqual({
      [MCP_SERVER_NAME]: { command: "npx", args: ["-y", "@ctxlite/mcp"] },
    })
  })

  it("is idempotent when entry already matches", () => {
    const existing = {
      mcpServers: {
        [MCP_SERVER_NAME]: { command: "npx", args: ["-y", "@ctxlite/mcp"] },
      },
    }
    const { changed } = mergeMcpConfig(existing, { command: "npx", args: ["-y", "@ctxlite/mcp"] })
    expect(changed).toBe(false)
  })
})

describe("mergeOpenCodeConfig", () => {
  it("adds plugin to array", () => {
    const { next, changed } = mergeOpenCodeConfig({})
    expect(changed).toBe(true)
    expect(next.plugin).toEqual([OPENCODE_PLUGIN])
    expect(next.$schema).toBe("https://opencode.ai/config.json")
  })

  it("preserves existing plugins", () => {
    const { next, changed } = mergeOpenCodeConfig({ plugin: ["other-plugin"] })
    expect(changed).toBe(true)
    expect(next.plugin).toEqual(["other-plugin", OPENCODE_PLUGIN])
  })
})

describe("mergeOpenCodeTuiConfig", () => {
  it("adds plugin to array without injecting a $schema", () => {
    const { next, changed } = mergeOpenCodeTuiConfig({})
    expect(changed).toBe(true)
    expect(next.plugin).toEqual([OPENCODE_PLUGIN])
    expect(next.$schema).toBeUndefined()
  })

  it("is idempotent when plugin already present", () => {
    const { changed } = mergeOpenCodeTuiConfig({ plugin: [OPENCODE_PLUGIN] })
    expect(changed).toBe(false)
  })

  it("removes only the ctxlite plugin via applyConfigChange", () => {
    const existing = { plugin: ["other-plugin", OPENCODE_PLUGIN] }
    const { next, changed } = applyConfigChange("opencode-tui", existing, true)
    expect(changed).toBe(true)
    expect(next.plugin).toEqual(["other-plugin"])
  })
})

describe("applyConfigChange remove", () => {
  it("removes only ctxlite mcp server", () => {
    const existing = {
      mcpServers: {
        [MCP_SERVER_NAME]: { command: "npx", args: ["-y", "@ctxlite/mcp"] },
        github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
      },
    }
    const { next, changed } = applyConfigChange("mcp", existing, true)
    expect(changed).toBe(true)
    expect(next.mcpServers).toEqual({
      github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    })
  })
})

describe("buildTargets", () => {
  it("resolves cursor global path under home", () => {
    const targets = buildTargets(["cursor"], "global", { homeDir: "/home/test" })
    expect(targets[0]?.configPath).toBe("/home/test/.cursor/mcp.json")
    expect(targets[0]?.kind).toBe("mcp")
  })

  it("resolves opencode project path", () => {
    const targets = buildTargets(["opencode"], "project", { projectDir: "/repo" })
    expect(targets[0]?.configPath).toBe("/repo/opencode.json")
    expect(targets[0]?.kind).toBe("opencode")
  })

  it("also targets tui.json for opencode (TUI-side plugin registration)", () => {
    const targets = buildTargets(["opencode"], "global", { homeDir: "/home/test" })
    expect(targets).toHaveLength(2)
    expect(targets[1]?.configPath).toBe("/home/test/.config/opencode/tui.json")
    expect(targets[1]?.kind).toBe("opencode-tui")
  })
})

describe("runInstall", () => {
  it("writes cursor project config", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const plan = await runInstall({
        tools: ["cursor"],
        scope: "project",
        projectDir: root,
        homeDir: root,
      })

      expect(plan[0]?.action).toBe("create")
      const raw = await readFile(join(root, ".cursor", "mcp.json"), "utf8")
      const parsed = JSON.parse(raw) as { mcpServers: Record<string, unknown> }
      expect(parsed.mcpServers.ctxlite).toEqual({
        command: "npx",
        args: ["-y", "@ctxlite/mcp"],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("dry-run does not write files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const plan = await planInstall({
        tools: ["claude-code"],
        scope: "project",
        projectDir: root,
        homeDir: root,
        dryRun: true,
      })

      expect(plan[0]?.action).toBe("create")
      await expect(readFile(join(root, ".mcp.json"), "utf8")).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("planInstall all global", () => {
  it("returns five targets for all tools (opencode counts as two: server + tui)", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const plan = await planInstall({
        tools: ["cursor", "opencode", "claude-code", "claude-desktop"],
        scope: "global",
        homeDir: root,
        projectDir: root,
        dryRun: true,
      })
      expect(plan).toHaveLength(5)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
