import { describe, it, expect } from "vitest"
import { optimizeBashCommand, optimizeReadPath, optimizeToolArgs } from "./tool-precall.js"

describe("optimizeBashCommand", () => {
  it("adds --silent to npm test", () => {
    const result = optimizeBashCommand("npm test")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--silent")
    expect(result.estimatedTokensSaved).toBeGreaterThan(0)
  })

  it("adds -q to pytest", () => {
    const result = optimizeBashCommand("pytest tests/")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("-q")
  })

  it("leaves already-quiet commands unchanged", () => {
    const result = optimizeBashCommand("npm test --silent")
    expect(result.modified).toBe(false)
  })

  it("does not rewrite a piped command (regression: flag was landing on the wrong command)", () => {
    // appendFlag used to stick the flag on the end of the whole string,
    // turning this into `... | tail -20 --loglevel=warn`, which breaks tail.
    const result = optimizeBashCommand("npm run build 2>&1 | tail -20")
    expect(result.modified).toBe(false)
    expect(result.args.command).toBe("npm run build 2>&1 | tail -20")
  })

  it("does not rewrite a chained command (regression: same root cause, && instead of |)", () => {
    const result = optimizeBashCommand("npm test && echo done")
    expect(result.modified).toBe(false)
  })

  it("does not rewrite when the matched command isn't the last one in a semicolon list", () => {
    const result = optimizeBashCommand("npm test; echo done")
    expect(result.modified).toBe(false)
  })

  it("still rewrites a simple command with no chaining", () => {
    const result = optimizeBashCommand("npm run build")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--loglevel=warn")
  })

  it("adds --loglevel=warn to npm install", () => {
    const result = optimizeBashCommand("npm install")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--loglevel=warn")
  })

  it("adds --loglevel=warn to npm ci", () => {
    const result = optimizeBashCommand("npm ci")
    expect(result.modified).toBe(true)
  })

  it("does not treat npm-run-something-named-install as npm install", () => {
    const result = optimizeBashCommand("npm run install-deps")
    expect(result.modified).toBe(false)
  })

  it("adds -q to pip install", () => {
    const result = optimizeBashCommand("pip install requests")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("-q")
  })

  it("adds --quiet to composer install", () => {
    const result = optimizeBashCommand("composer install")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--quiet")
  })

  it("adds --quiet to bundle install", () => {
    const result = optimizeBashCommand("bundle install")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--quiet")
  })

  it("adds -q to a maven goal", () => {
    const result = optimizeBashCommand("mvn package")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("-q")
  })

  it("does not add -q when maven debug flags are already present", () => {
    const result = optimizeBashCommand("mvn package -X")
    expect(result.modified).toBe(false)
  })

  it("adds -q to a gradle task", () => {
    const result = optimizeBashCommand("./gradlew build")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("-q")
  })

  it("adds -s to a make target", () => {
    const result = optimizeBashCommand("make all")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("-s")
  })

  it("adds --logLevel warn to vite build", () => {
    const result = optimizeBashCommand("vite build")
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--logLevel warn")
  })

  it("does not rewrite a tool name mentioned in a quoted commit message (regression: false-positive match on prose, not a real invocation)", () => {
    const command = `git commit -m "fix npm install bug"`
    const result = optimizeBashCommand(command)
    expect(result.modified).toBe(false)
    expect(result.args.command).toBe(command)
  })

  it("does not rewrite a tool name mentioned inside a heredoc commit message (regression: this exact command broke while writing this release)", () => {
    const command = `git commit -m "$(cat <<'EOF'\nfix: npm install bug and pytest flakiness\nEOF\n)"`
    const result = optimizeBashCommand(command)
    expect(result.modified).toBe(false)
    expect(result.args.command).toBe(command)
  })

  it("does not rewrite a tool name mentioned inside an echo string", () => {
    const result = optimizeBashCommand(`echo "remember to run npm test later"`)
    expect(result.modified).toBe(false)
  })

  it("still rewrites the real command even when an unrelated quoted string is also present", () => {
    const result = optimizeBashCommand(`npm test --testPathPattern="auth"`)
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--silent")
    expect(result.args.command).toContain(`--testPathPattern="auth"`)
  })
})

describe("optimizeReadPath", () => {
  it("blocks node_modules reads", () => {
    const result = optimizeReadPath("node_modules/foo/index.js")
    expect(result.blocked).toBe(true)
    expect(result.estimatedTokensSaved).toBeGreaterThan(0)
  })

  it("allows normal source reads", () => {
    const result = optimizeReadPath("src/index.ts")
    expect(result.blocked).toBe(false)
  })
})

describe("optimizeToolArgs", () => {
  it("routes bash tool", () => {
    const result = optimizeToolArgs("bash", { command: "cargo test" })
    expect(result.modified).toBe(true)
    expect(result.args.command).toContain("--quiet")
  })
})
