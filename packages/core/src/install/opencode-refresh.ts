import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { rm } from "node:fs/promises"
import { homedir as nodeHomedir } from "node:os"
import { join } from "node:path"
import type { InstallScope } from "./types.js"

const execFileAsync = promisify(execFile)

/**
 * OpenCode resolves a plugin's "latest" version once, then pins it in its
 * own package-lock.json under this cache dir and never re-resolves it —
 * even after newer versions are published to npm. `opencode plugin --force`
 * alone just reinstalls that pinned version, so the cache must be cleared
 * first to pick up a real update.
 */
export function opencodePluginCacheDir(homeDir: string = nodeHomedir()): string {
  return join(homeDir, ".cache", "opencode", "packages", "@ctxlite")
}

export interface OpenCodeRefreshResult {
  attempted: boolean
  ok: boolean
  message: string
}

export async function refreshOpenCodePlugin(
  scope: InstallScope,
  homeDir: string = nodeHomedir(),
): Promise<OpenCodeRefreshResult> {
  try {
    await execFileAsync("opencode", ["--version"])
  } catch {
    return { attempted: false, ok: false, message: "opencode CLI not found on PATH — skipped cache refresh" }
  }

  try {
    await rm(opencodePluginCacheDir(homeDir), { recursive: true, force: true })
  } catch {
    // Best-effort — a missing or unreadable cache dir is not fatal
  }

  const args =
    scope === "global"
      ? ["plugin", "@ctxlite/opencode", "-g", "--force"]
      : ["plugin", "@ctxlite/opencode", "--force"]

  try {
    await execFileAsync("opencode", args)
    return { attempted: true, ok: true, message: "Refreshed OpenCode's cached plugin version" }
  } catch (err) {
    return {
      attempted: true,
      ok: false,
      message: `Cleared stale cache but \`opencode ${args.join(" ")}\` failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    }
  }
}
