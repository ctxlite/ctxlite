import { describe, it, expect } from "vitest"
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  applyConfigChange,
  buildTargets,
  mergeClaudeCodeHooksConfig,
  mergeCursorHooksConfig,
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
    expect(next.mcpServers).toBeUndefined()
  })

  it("preserves existing plugins", () => {
    const { next, changed } = mergeOpenCodeConfig({ plugin: ["other-plugin"] })
    expect(changed).toBe(true)
    expect(next.plugin).toEqual(["other-plugin", OPENCODE_PLUGIN])
    expect(next.mcpServers).toBeUndefined()
  })

  it("strips invalid mcpServers key from opencode.json", () => {
    const existing = {
      plugin: [OPENCODE_PLUGIN],
      mcpServers: { ctxlite: { command: "npx", args: ["-y", "@ctxlite/mcp"] } },
    }
    const { next, changed } = mergeOpenCodeConfig(existing)
    expect(changed).toBe(true)
    expect(next.mcpServers).toBeUndefined()
    expect(next.plugin).toEqual([OPENCODE_PLUGIN])
  })

  it("is idempotent when plugin already present", () => {
    const existing = {
      $schema: "https://opencode.ai/config.json",
      plugin: [OPENCODE_PLUGIN],
    }
    const { changed } = mergeOpenCodeConfig(existing)
    expect(changed).toBe(false)
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

describe("mergeClaudeCodeHooksConfig", () => {
  it("adds PreToolUse and PostToolUse matcher groups", () => {
    const { next, changed } = mergeClaudeCodeHooksConfig({})
    expect(changed).toBe(true)
    const hooks = next.hooks as { PreToolUse: unknown[]; PostToolUse: unknown[] }
    expect(hooks.PreToolUse).toHaveLength(1)
    expect(hooks.PostToolUse).toHaveLength(1)
  })

  it("preserves existing unrelated hooks on the same event", () => {
    const existing = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "some-other-tool" }] }],
      },
    }
    const { next, changed } = mergeClaudeCodeHooksConfig(existing)
    expect(changed).toBe(true)
    const pre = (next.hooks as { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }).PreToolUse
    expect(pre).toHaveLength(2)
    expect(pre[0]?.hooks[0]?.command).toBe("some-other-tool")
  })

  it("is idempotent when ctxlite hooks already present", () => {
    const { next } = mergeClaudeCodeHooksConfig({})
    const { changed } = mergeClaudeCodeHooksConfig(next)
    expect(changed).toBe(false)
  })

  it("removes only ctxlite's hook groups via applyConfigChange", () => {
    const existing = {
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "some-other-tool" }] },
          { matcher: "*", hooks: [{ type: "command", command: "npx -y @ctxlite/cli hook pre-tool-use" }] },
        ],
        PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "npx -y @ctxlite/cli hook post-tool-use" }] }],
      },
    }
    const { next, changed } = applyConfigChange("claude-code-hooks", existing, true)
    expect(changed).toBe(true)
    const hooks = next.hooks as { PreToolUse: unknown[]; PostToolUse: unknown[] }
    expect(hooks.PreToolUse).toHaveLength(1)
    expect(hooks.PostToolUse).toHaveLength(0)
  })
})

describe("mergeCursorHooksConfig", () => {
  it("adds a preToolUse entry with version: 1", () => {
    const { next, changed } = mergeCursorHooksConfig({})
    expect(changed).toBe(true)
    expect(next.version).toBe(1)
    const preToolUse = (next.hooks as { preToolUse: Array<{ command: string }> }).preToolUse
    expect(preToolUse).toHaveLength(1)
    expect(preToolUse[0]?.command).toContain("cursor-pre-tool-use")
  })

  it("preserves existing unrelated preToolUse entries", () => {
    const existing = { hooks: { preToolUse: [{ command: "some-other-tool" }] } }
    const { next, changed } = mergeCursorHooksConfig(existing)
    expect(changed).toBe(true)
    const preToolUse = (next.hooks as { preToolUse: Array<{ command: string }> }).preToolUse
    expect(preToolUse).toHaveLength(2)
    expect(preToolUse[0]?.command).toBe("some-other-tool")
  })

  it("is idempotent when ctxlite's hook already present", () => {
    const { next } = mergeCursorHooksConfig({})
    const { changed } = mergeCursorHooksConfig(next)
    expect(changed).toBe(false)
  })

  it("removes only ctxlite's entry via applyConfigChange", () => {
    const existing = {
      hooks: {
        preToolUse: [{ command: "some-other-tool" }, { command: "npx -y @ctxlite/cli hook cursor-pre-tool-use" }],
      },
    }
    const { next, changed } = applyConfigChange("cursor-hooks", existing, true)
    expect(changed).toBe(true)
    const preToolUse = (next.hooks as { preToolUse: Array<{ command: string }> }).preToolUse
    expect(preToolUse).toHaveLength(1)
    expect(preToolUse[0]?.command).toBe("some-other-tool")
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

  it("also targets tui.json and a skill file for opencode", () => {
    const targets = buildTargets(["opencode"], "global", { homeDir: "/home/test" })
    expect(targets).toHaveLength(3)
    expect(targets[1]?.configPath).toBe("/home/test/.config/opencode/tui.json")
    expect(targets[1]?.kind).toBe("opencode-tui")
    expect(targets[2]?.kind).toBe("opencode-skill")
  })

  it("also targets settings.json, a skill file, and a conciseness rule file for claude-code (hooks registration)", () => {
    const targets = buildTargets(["claude-code"], "global", { homeDir: "/home/test" })
    expect(targets).toHaveLength(4)
    expect(targets[0]?.kind).toBe("mcp")
    expect(targets[1]?.configPath).toBe("/home/test/.claude/settings.json")
    expect(targets[1]?.kind).toBe("claude-code-hooks")
    expect(targets[2]?.kind).toBe("claude-code-skill")
    expect(targets[3]?.kind).toBe("claude-code-conciseness-rule")
  })

  it("also targets hooks.json, a skill file, and a conciseness rule file for cursor (hooks registration)", () => {
    const targets = buildTargets(["cursor"], "global", { homeDir: "/home/test" })
    expect(targets).toHaveLength(4)
    expect(targets[0]?.kind).toBe("mcp")
    expect(targets[1]?.configPath).toBe("/home/test/.cursor/hooks.json")
    expect(targets[1]?.kind).toBe("cursor-hooks")
    expect(targets[2]?.kind).toBe("cursor-skill")
    expect(targets[3]?.kind).toBe("cursor-conciseness-rule")
  })

  it("resolves claude-code's conciseness rule path under .claude/rules/ctxlite-conciseness.md", () => {
    const globalTargets = buildTargets(["claude-code"], "global", { homeDir: "/home/test" })
    expect(globalTargets[3]?.configPath).toBe("/home/test/.claude/rules/ctxlite-conciseness.md")

    const projectTargets = buildTargets(["claude-code"], "project", { projectDir: "/repo" })
    expect(projectTargets[3]?.configPath).toBe("/repo/.claude/rules/ctxlite-conciseness.md")
  })

  it("resolves cursor's conciseness rule path under .cursor/rules/ctxlite-conciseness.mdc", () => {
    const globalTargets = buildTargets(["cursor"], "global", { homeDir: "/home/test" })
    expect(globalTargets[3]?.configPath).toBe("/home/test/.cursor/rules/ctxlite-conciseness.mdc")

    const projectTargets = buildTargets(["cursor"], "project", { projectDir: "/repo" })
    expect(projectTargets[3]?.configPath).toBe("/repo/.cursor/rules/ctxlite-conciseness.mdc")
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

  it("writes opencode config with plugin only (no mcpServers)", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const plan = await runInstall({
        tools: ["opencode"],
        scope: "project",
        projectDir: root,
        homeDir: root,
      })

      expect(plan[0]?.action).toBe("create")
      const raw = await readFile(join(root, "opencode.json"), "utf8")
      const parsed = JSON.parse(raw) as { plugin: string[]; mcpServers?: unknown }
      expect(parsed.plugin).toContain(OPENCODE_PLUGIN)
      expect(parsed.mcpServers).toBeUndefined()
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
  it("returns twelve targets for all tools (cursor and claude-code each count as four: mcp/config, hooks, skill, conciseness rule; opencode counts as three: config, tui, skill; claude-desktop counts as one)", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const plan = await planInstall({
        tools: ["cursor", "opencode", "claude-code", "claude-desktop"],
        scope: "global",
        homeDir: root,
        projectDir: root,
        dryRun: true,
      })
      expect(plan).toHaveLength(12)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("skill install (claude-code-skill / cursor-skill / opencode-skill)", () => {
  it("resolves claude-code's skill path under .claude/skills/ctxlite/SKILL.md", () => {
    const targets = buildTargets(["claude-code"], "global", { homeDir: "/home/test" })
    expect(targets).toHaveLength(4)
    expect(targets[2]?.configPath).toBe("/home/test/.claude/skills/ctxlite/SKILL.md")
    expect(targets[2]?.kind).toBe("claude-code-skill")
  })

  it("resolves cursor's skill path under .cursor/skills/ctxlite/SKILL.md (not skills-cursor/, which is reserved)", () => {
    const targets = buildTargets(["cursor"], "project", { projectDir: "/repo" })
    expect(targets).toHaveLength(4)
    expect(targets[2]?.configPath).toBe("/repo/.cursor/skills/ctxlite/SKILL.md")
    expect(targets[2]?.kind).toBe("cursor-skill")
  })

  it("resolves opencode's skill path under .opencode/skills/ctxlite/SKILL.md for project scope", () => {
    const targets = buildTargets(["opencode"], "project", { projectDir: "/repo" })
    expect(targets).toHaveLength(3)
    expect(targets[2]?.configPath).toBe("/repo/.opencode/skills/ctxlite/SKILL.md")
    expect(targets[2]?.kind).toBe("opencode-skill")
  })

  it("writes the SKILL.md file with frontmatter on install", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const plan = await runInstall({
        tools: ["claude-code"],
        scope: "project",
        projectDir: root,
        homeDir: root,
      })

      const skillItem = plan.find((p) => p.configPath.endsWith("SKILL.md"))
      expect(skillItem?.action).toBe("create")
      const content = await readFile(join(root, ".claude", "skills", "ctxlite", "SKILL.md"), "utf8")
      expect(content).toContain("name: ctxlite")
      for (const tool of [
        "smart_read",
        "trim_context",
        "get_stats",
        "diff_read",
        "log_summary",
        "code_search",
        "budget_planner",
      ]) {
        expect(content).toContain(tool)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("is idempotent — re-running install skips an already-current SKILL.md", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      await runInstall({ tools: ["cursor"], scope: "project", projectDir: root, homeDir: root })
      const plan = await runInstall({ tools: ["cursor"], scope: "project", projectDir: root, homeDir: root })
      const skillItem = plan.find((p) => p.configPath.endsWith("SKILL.md"))
      expect(skillItem?.action).toBe("skip")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("removes the SKILL.md file when remove: true", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      await runInstall({ tools: ["opencode"], scope: "project", projectDir: root, homeDir: root })
      const skillPath = join(root, ".opencode", "skills", "ctxlite", "SKILL.md")
      await expect(readFile(skillPath, "utf8")).resolves.toBeTruthy()

      const plan = await runInstall({
        tools: ["opencode"],
        scope: "project",
        projectDir: root,
        homeDir: root,
        remove: true,
      })
      const skillItem = plan.find((p) => p.configPath.endsWith("SKILL.md"))
      expect(skillItem?.action).toBe("remove")
      await expect(readFile(skillPath, "utf8")).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("conciseness rule install (claude-code-conciseness-rule / cursor-conciseness-rule)", () => {
  it("writes .claude/rules/ctxlite-conciseness.md with the conciseness instructions", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const plan = await runInstall({ tools: ["claude-code"], scope: "project", projectDir: root, homeDir: root })

      const item = plan.find((p) => p.configPath.endsWith("ctxlite-conciseness.md"))
      expect(item?.action).toBe("create")
      const content = await readFile(join(root, ".claude", "rules", "ctxlite-conciseness.md"), "utf8")
      expect(content).toContain("Skip preamble")
      expect(content).toContain("Skip recap")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("writes .cursor/rules/ctxlite-conciseness.mdc with alwaysApply: true frontmatter and the conciseness instructions", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const plan = await runInstall({ tools: ["cursor"], scope: "project", projectDir: root, homeDir: root })

      const item = plan.find((p) => p.configPath.endsWith("ctxlite-conciseness.mdc"))
      expect(item?.action).toBe("create")
      const content = await readFile(join(root, ".cursor", "rules", "ctxlite-conciseness.mdc"), "utf8")
      expect(content).toContain("alwaysApply: true")
      expect(content).toContain("Skip preamble")
      expect(content).toContain("Skip recap")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("is idempotent — re-running install skips an already-current conciseness rule file (both hosts)", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      await runInstall({ tools: ["claude-code", "cursor"], scope: "project", projectDir: root, homeDir: root })
      const plan = await runInstall({ tools: ["claude-code", "cursor"], scope: "project", projectDir: root, homeDir: root })

      const claudeItem = plan.find((p) => p.configPath.endsWith("ctxlite-conciseness.md"))
      expect(claudeItem?.action).toBe("skip")
      const cursorItem = plan.find((p) => p.configPath.endsWith("ctxlite-conciseness.mdc"))
      expect(cursorItem?.action).toBe("skip")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("removes both conciseness rule files when remove: true", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      await runInstall({ tools: ["claude-code", "cursor"], scope: "project", projectDir: root, homeDir: root })
      const claudePath = join(root, ".claude", "rules", "ctxlite-conciseness.md")
      const cursorPath = join(root, ".cursor", "rules", "ctxlite-conciseness.mdc")
      await expect(readFile(claudePath, "utf8")).resolves.toBeTruthy()
      await expect(readFile(cursorPath, "utf8")).resolves.toBeTruthy()

      const plan = await runInstall({
        tools: ["claude-code", "cursor"],
        scope: "project",
        projectDir: root,
        homeDir: root,
        remove: true,
      })

      const claudeItem = plan.find((p) => p.configPath.endsWith("ctxlite-conciseness.md"))
      expect(claudeItem?.action).toBe("remove")
      const cursorItem = plan.find((p) => p.configPath.endsWith("ctxlite-conciseness.mdc"))
      expect(cursorItem?.action).toBe("remove")
      await expect(readFile(claudePath, "utf8")).rejects.toThrow()
      await expect(readFile(cursorPath, "utf8")).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("never touches an existing CLAUDE.md or an existing .cursor/rules/security.mdc-style file", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctxlite-install-"))
    try {
      const claudeMdPath = join(root, "CLAUDE.md")
      await writeFile(claudeMdPath, "# My project instructions\nDo not touch this.\n", "utf8")

      await mkdir(join(root, ".cursor", "rules"), { recursive: true })
      const otherRulePath = join(root, ".cursor", "rules", "security.mdc")
      const otherRuleContent = "---\ndescription: Security rules\nalwaysApply: true\n---\n\n# Security Rules\n"
      await writeFile(otherRulePath, otherRuleContent, "utf8")

      const before = {
        claudeMd: await readFile(claudeMdPath, "utf8"),
        otherRule: await readFile(otherRulePath, "utf8"),
      }

      await runInstall({ tools: ["claude-code", "cursor"], scope: "project", projectDir: root, homeDir: root })

      const after = {
        claudeMd: await readFile(claudeMdPath, "utf8"),
        otherRule: await readFile(otherRulePath, "utf8"),
      }

      expect(after.claudeMd).toBe(before.claudeMd)
      expect(after.otherRule).toBe(before.otherRule)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
