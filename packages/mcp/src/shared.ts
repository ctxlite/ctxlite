import { join } from "path"
import { homedir } from "os"

/**
 * SQLite path shared with @ctxlite/opencode and ctxlite CLI.
 */
export const STATS_DB_PATH = join(homedir(), ".ctxlite", "stats.db")
