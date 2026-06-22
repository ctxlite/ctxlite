import { join } from "path"
import { homedir } from "os"

/**
 * Shared SQLite path for plugin, MCP, and CLI stats.
 */
export function getStatsDbPath(): string {
  return join(homedir(), ".ctxlite", "stats.db")
}
