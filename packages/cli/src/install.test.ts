import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { Readable } from "node:stream"

// refreshOpenCodePlugin shells out to a real `opencode` binary on PATH and
// would touch the real user's ~/.cache/opencode — never let that run for
// real from a test. Everything else from @ctxlite/core stays real.
const refreshOpenCodePlugin = vi.fn().mockResolvedValue({ attempted: false, ok: false, message: "skipped" })
vi.mock("@ctxlite/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ctxlite/core")>()
  return { ...actual, refreshOpenCodePlugin }
})

// install.ts does `import { stdin as input } from "node:process"` at module
// load — that captures whatever process.stdin resolves to AT THAT MOMENT, not
// a live binding. The interactive-prompt tests below need to control stdin,
// so this fake (with isTTY: true) must be installed before the dynamic
// import, and is reused (never ended) across all of them — each test just
// pushes the answer lines it needs right before invoking the SUT.
const fakeStdin = Object.assign(new Readable({ read() {} }), {
  isTTY: false,
  setRawMode: () => fakeStdin,
  ref: () => fakeStdin,
  unref: () => fakeStdin,
})
Object.defineProperty(process, "stdin", { value: fakeStdin, configurable: true })

function feedStdin(...answers: string[]) {
  for (const answer of answers) {
    fakeStdin.push(`${answer}\n`)
  }
}

const { parseInstallArgs, runInstallCommand } = await import("./install.js")

function captureStdio() {
  const out: string[] = []
  const err: string[] = []
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out.push(String(chunk))
    return true
  })
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err.push(String(chunk))
    return true
  })
  return {
    stdout: () => out.join(""),
    stderr: () => err.join(""),
    restore: () => {
      outSpy.mockRestore()
      errSpy.mockRestore()
    },
  }
}

describe("parseInstallArgs", () => {
  it("parses tool and scope flags", () => {
    const args = parseInstallArgs(["--tool", "opencode", "--scope", "project", "--yes"])
    expect(args.tools).toEqual(["opencode"])
    expect(args.scope).toBe("project")
    expect(args.yes).toBe(true)
  })

  it("parses all tools as just opencode (Cursor/Claude Code/Claude Desktop are no longer installable — see docs/benchmarks.md)", () => {
    const args = parseInstallArgs(["--tool", "all"])
    expect(args.tools).toEqual(["opencode"])
  })

  it("rejects a no-longer-supported tool (cursor, claude-code, claude-desktop) with a clear error naming what IS valid", () => {
    expect(() => parseInstallArgs(["--tool", "cursor"])).toThrow('Unknown tool "cursor". Valid: opencode, all')
    expect(() => parseInstallArgs(["--tool", "claude-code"])).toThrow('Unknown tool "claude-code"')
    expect(() => parseInstallArgs(["--tool", "claude-desktop"])).toThrow('Unknown tool "claude-desktop"')
  })

  it("throws on unknown option", () => {
    expect(() => parseInstallArgs(["--wat"])).toThrow('Unknown option "--wat"')
  })

  it("parses --project-dir, --dry-run, --remove, and -y", () => {
    const args = parseInstallArgs(["--project-dir", "/tmp/proj", "--dry-run", "--remove", "-y"])
    expect(args.projectDir).toBe("/tmp/proj")
    expect(args.dryRun).toBe(true)
    expect(args.remove).toBe(true)
    expect(args.yes).toBe(true)
  })

  it("parses --help and -h", () => {
    expect(parseInstallArgs(["--help"]).help).toBe(true)
    expect(parseInstallArgs(["-h"]).help).toBe(true)
  })

  it("rejects an invalid --scope value", () => {
    expect(() => parseInstallArgs(["--scope", "nowhere"])).toThrow('Invalid scope "nowhere"')
  })
})

describe("runInstallCommand", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctxlite-install-cmd-"))
    refreshOpenCodePlugin.mockClear()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("prints help and exits 0", async () => {
    const io = captureStdio()
    try {
      const code = await runInstallCommand(["--help"])
      expect(code).toBe(0)
      expect(io.stdout()).toContain("ctxlite install")
    } finally {
      io.restore()
    }
  })

  it("rejects a bad flag with exit code 1", async () => {
    const io = captureStdio()
    try {
      const code = await runInstallCommand(["--bogus"])
      expect(code).toBe(1)
      expect(io.stderr()).toContain("Unknown option")
    } finally {
      io.restore()
    }
  })

  it("requires --tool in non-interactive mode (no TTY)", async () => {
    const io = captureStdio()
    try {
      const code = await runInstallCommand(["--scope", "project", "--project-dir", root])
      expect(code).toBe(1)
      expect(io.stderr()).toContain("--tool is required")
    } finally {
      io.restore()
    }
  })

  it("rejects an unsupported tool with a clear, non-interactive error", async () => {
    const io = captureStdio()
    try {
      const code = await runInstallCommand(["--tool", "claude-desktop", "--scope", "project", "--project-dir", root])
      expect(code).toBe(1)
      expect(io.stderr()).toContain('Unknown tool "claude-desktop"')
    } finally {
      io.restore()
    }
  })

  it("--dry-run prints the plan and writes nothing", async () => {
    const io = captureStdio()
    try {
      const code = await runInstallCommand([
        "--tool",
        "opencode",
        "--scope",
        "project",
        "--project-dir",
        root,
        "--dry-run",
      ])
      expect(code).toBe(0)
      expect(io.stdout()).toContain("[create]")
      expect(() => readFileSync(join(root, "opencode.json"))).toThrow()
    } finally {
      io.restore()
    }
  })

  it("requires --yes in non-interactive mode when not a dry run", async () => {
    const io = captureStdio()
    try {
      const code = await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root])
      expect(code).toBe(1)
      expect(io.stderr()).toContain("use --yes in non-interactive mode")
    } finally {
      io.restore()
    }
  })

  it("--yes installs for real and reports the number of files changed", async () => {
    const io = captureStdio()
    try {
      const code = await runInstallCommand([
        "--tool",
        "opencode",
        "--scope",
        "project",
        "--project-dir",
        root,
        "--yes",
      ])
      expect(code).toBe(0)
      expect(io.stdout()).toContain("Done. Updated")
      const config = JSON.parse(readFileSync(join(root, "opencode.json"), "utf8"))
      expect(config.plugin).toContain("@ctxlite/opencode")
    } finally {
      io.restore()
    }
  })

  it("reports nothing-to-change on a second --yes run", async () => {
    await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root, "--yes"])

    const io = captureStdio()
    try {
      const code = await runInstallCommand([
        "--tool",
        "opencode",
        "--scope",
        "project",
        "--project-dir",
        root,
        "--yes",
      ])
      expect(code).toBe(0)
      expect(io.stdout()).toContain("Nothing to change")
    } finally {
      io.restore()
    }
  })

  it("--remove removes a previously installed entry", async () => {
    await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root, "--yes"])

    const io = captureStdio()
    try {
      const code = await runInstallCommand([
        "--tool",
        "opencode",
        "--scope",
        "project",
        "--project-dir",
        root,
        "--yes",
        "--remove",
      ])
      expect(code).toBe(0)
      expect(io.stdout()).toContain("Done. Updated")
      const config = JSON.parse(readFileSync(join(root, "opencode.json"), "utf8"))
      expect(config.plugin ?? []).not.toContain("@ctxlite/opencode")
    } finally {
      io.restore()
    }
  })

  it("attempts an OpenCode plugin cache refresh when opencode is among the installed tools", async () => {
    const io = captureStdio()
    try {
      await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root, "--yes"])
      expect(refreshOpenCodePlugin).toHaveBeenCalledWith("project")
    } finally {
      io.restore()
    }
  })

  it("does not attempt an OpenCode refresh on --remove", async () => {
    await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root, "--yes"])
    refreshOpenCodePlugin.mockClear()

    const io = captureStdio()
    try {
      await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root, "--yes", "--remove"])
      expect(refreshOpenCodePlugin).not.toHaveBeenCalled()
    } finally {
      io.restore()
    }
  })

  it("prints the refresh message when the attempt is real", async () => {
    refreshOpenCodePlugin.mockResolvedValueOnce({ attempted: true, ok: true, message: "Refreshed it" })
    const io = captureStdio()
    try {
      await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root, "--yes"])
      expect(io.stdout()).toContain("Refreshed it")
    } finally {
      io.restore()
    }
  })
})

describe("runInstallCommand interactive prompts", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctxlite-install-cmd-interactive-"))
    refreshOpenCodePlugin.mockClear()
    fakeStdin.isTTY = true
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    fakeStdin.isTTY = false
  })

  it("prompts for tools and scope, defaulting to all tools (just opencode) on an empty answer", async () => {
    const io = captureStdio()
    // Two sequential readline.createInterface() calls (tools, then scope)
    // share this one fake stdin — pushing both answers upfront races with
    // the first interface's line buffering and can swallow the second one.
    // Pushing the scope answer only once the tools prompt has actually
    // finished (visible in captured stdout) avoids that.
    feedStdin("")
    const promise = runInstallCommand(["--project-dir", root, "--dry-run"])
    // Wait for promptScope's own prompt text — printed only once promptTools
    // has fully resolved and closed its readline interface.
    await vi.waitFor(() => expect(io.stdout()).toContain("Scope [1=global"))
    feedStdin("2")
    try {
      const code = await promise
      expect(code).toBe(0)
      expect(io.stdout()).toContain("[create]")
    } finally {
      io.restore()
    }
  })

  it("prompts for specific tools by number and skips the scope prompt when --scope was passed", async () => {
    const io = captureStdio()
    feedStdin("1")
    try {
      const code = await runInstallCommand(["--scope", "project", "--project-dir", root, "--dry-run"])
      expect(code).toBe(0)
      expect(io.stdout()).not.toContain("Scope [1=global")
      expect(io.stdout()).toContain("[create]")
    } finally {
      io.restore()
    }
  })

  it("rejects an out-of-range tool selection", async () => {
    const io = captureStdio()
    feedStdin("99")
    try {
      await expect(runInstallCommand(["--scope", "project", "--project-dir", root, "--dry-run"])).rejects.toThrow(
        "No valid tools selected",
      )
    } finally {
      io.restore()
    }
  })

  it("prompts for confirmation before applying when --yes is omitted", async () => {
    const io = captureStdio()
    feedStdin("y")
    try {
      const code = await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root])
      expect(code).toBe(0)
      expect(io.stdout()).toContain("Proceed?")
      expect(io.stdout()).toContain("Done. Updated")
    } finally {
      io.restore()
    }
  })

  it("cancels without writing anything when the user declines confirmation", async () => {
    const io = captureStdio()
    feedStdin("n")
    try {
      const code = await runInstallCommand(["--tool", "opencode", "--scope", "project", "--project-dir", root])
      expect(code).toBe(0)
      expect(io.stdout()).toContain("Cancelled.")
      expect(() => readFileSync(join(root, "opencode.json"))).toThrow()
    } finally {
      io.restore()
    }
  })
})
