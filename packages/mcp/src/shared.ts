import { join } from "path"
import { homedir } from "os"
import { randomUUID } from "crypto"

/**
 * SQLite path shared with @ctxlite/opencode and ctxlite CLI.
 */
export const STATS_DB_PATH = join(homedir(), ".ctxlite", "stats.db")

/**
 * MCP gives tool handlers no real session/conversation id — the host
 * (Cursor, Claude Code, Claude Desktop) doesn't pass one. This approximates
 * "one session" as the lifetime of this server process, which in practice
 * usually matches one client session since hosts typically spawn a fresh
 * `npx @ctxlite/mcp` process per connection.
 */
export const MCP_PROCESS_SESSION_ID = randomUUID()
