import { describe, it, expect, afterEach } from "vitest"
import { mkdtemp, mkdir, rm, writeFile, chmod, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { opencodePluginCacheDir, refreshOpenCodePlugin } from "./opencode-refresh.js"

const originalPath = process.env.PATH

async function makeFakeOpencodeBin(behavior: "ok" | "fail"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ctxlite-fake-bin-"))
  const logPath = join(dir, "calls.log")
  const script = `#!/usr/bin/env bash
echo "$@" >> "${logPath}"
if [ "$1" = "--version" ]; then
  echo "1.0.0"
  exit 0
fi
${behavior === "fail" ? "exit 1" : "exit 0"}
`
  const binPath = join(dir, "opencode")
  await writeFile(binPath, script)
  await chmod(binPath, 0o755)
  return dir
}

describe("opencodePluginCacheDir", () => {
  it("points at ~/.cache/opencode/packages/@ctxlite", () => {
    expect(opencodePluginCacheDir("/home/user")).toBe("/home/user/.cache/opencode/packages/@ctxlite")
  })
})

describe("refreshOpenCodePlugin", () => {
  let tmpHome: string
  let fakeBinDir: string | undefined

  afterEach(async () => {
    process.env.PATH = originalPath
    if (tmpHome) await rm(tmpHome, { recursive: true, force: true })
    if (fakeBinDir) await rm(fakeBinDir, { recursive: true, force: true })
  })

  it("skips when the opencode CLI is not on PATH", async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "ctxlite-home-"))
    process.env.PATH = "/nonexistent-bin-dir"

    const result = await refreshOpenCodePlugin("global", tmpHome)

    expect(result.attempted).toBe(false)
    expect(result.ok).toBe(false)
  })

  it("clears the stale cache dir and re-runs the plugin install with --force", async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "ctxlite-home-"))
    fakeBinDir = await makeFakeOpencodeBin("ok")
    process.env.PATH = `${fakeBinDir}:${originalPath}`

    const cacheDir = opencodePluginCacheDir(tmpHome)
    await mkdir(cacheDir, { recursive: true })
    await writeFile(join(cacheDir, "stale-marker.txt"), "old version")

    const result = await refreshOpenCodePlugin("global", tmpHome)

    expect(result.attempted).toBe(true)
    expect(result.ok).toBe(true)

    const calls = await readFile(join(fakeBinDir, "calls.log"), "utf8")
    expect(calls).toContain("plugin @ctxlite/opencode -g --force")

    await expect(readFile(join(cacheDir, "stale-marker.txt"), "utf8")).rejects.toThrow()
  })

  it("uses no -g flag for project scope", async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "ctxlite-home-"))
    fakeBinDir = await makeFakeOpencodeBin("ok")
    process.env.PATH = `${fakeBinDir}:${originalPath}`

    await refreshOpenCodePlugin("project", tmpHome)

    const calls = await readFile(join(fakeBinDir, "calls.log"), "utf8")
    expect(calls).toContain("plugin @ctxlite/opencode --force")
    expect(calls).not.toContain("-g")
  })

  it("reports failure when the force-install step fails", async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "ctxlite-home-"))
    fakeBinDir = await makeFakeOpencodeBin("fail")
    process.env.PATH = `${fakeBinDir}:${originalPath}`

    const result = await refreshOpenCodePlugin("global", tmpHome)

    expect(result.attempted).toBe(true)
    expect(result.ok).toBe(false)
  })
})
