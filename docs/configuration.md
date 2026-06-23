# Configuration

This page covers the current plugin/MCP/hooks architecture (OpenCode, Cursor, Claude Code, Claude Desktop). For the legacy Go HTTP proxy, see [Legacy: Go HTTP proxy](#legacy-go-http-proxy) at the bottom — it's a separate, superseded architecture with its own config file and env vars.

## Install

### OpenCode

```bash
npx @ctxlite/cli install --tool opencode --scope global --yes
# or, using OpenCode's own installer:
opencode plugin @ctxlite/opencode -g -f
```

Writes two files: `~/.config/opencode/opencode.json` (server-side plugin: hooks, MCP-style tools) and `~/.config/opencode/tui.json` (TUI-side plugin: the sidebar widget). Use `--scope project` to scope to the current repo instead (`opencode.json` / `tui.json` in the project root).

**Automatic, no action needed:**

- Pre-call rewrite — quieter flags on `bash` commands, blocks low-signal reads (`node_modules/`, lockfiles)
- Tool output compression — ANSI strip, log folding, head/tail truncation for large output
- Stale-output capping and duplicate-output pruning across the conversation history before each request
- Conciseness instructions injected into the system prompt
- Sidebar widget showing live savings, a toast after each turn, and a `· ctxlite: X saved` suffix on the session title

**On demand (the agent calls a tool):**

- `get_stats` — token savings statistics
- `trim_context` — select the most relevant files from a candidate set you've already read
- `smart_read` — read a file as signatures only (functions/classes/methods, bodies omitted), or a budgeted head/tail read for unsupported languages

### Claude Code

```bash
npx @ctxlite/cli install --tool claude-code --scope global --yes
```

Writes two files: `~/.claude.json` (MCP server registration) and `~/.claude/settings.json` (PreToolUse/PostToolUse hooks) — merging into the `hooks` key rather than overwriting it, so other tools' hooks on the same event are preserved. Use `--scope project` for `.mcp.json` + `.claude/settings.json` in the repo instead.

**Automatic, no action needed** (via hooks, not MCP):

- PreToolUse — same pre-call rewrite as OpenCode (quiet `Bash` flags, blocks low-signal `Read`s)
- PostToolUse — same output compression as OpenCode (head/tail truncation), for any tool's output

**On demand (MCP):** `get_stats`, `trim_context`, `smart_read` — same tools as OpenCode, via MCP instead of the plugin tool registry.

### Cursor

```bash
npx @ctxlite/cli install --tool cursor --scope global --yes
```

Writes `~/.cursor/mcp.json` (MCP server) and `~/.cursor/hooks.json` (a `preToolUse` hook).

**Automatic, no action needed:**

- `preToolUse` — same pre-call rewrite as OpenCode/Claude Code (quiet `Shell` flags, blocks low-signal `Read`s)

**Not automatic here, unlike OpenCode/Claude Code:** Cursor's `postToolUse` can only replace output for MCP tools, not built-in ones (`Shell`, `Read`, `Write`) — so there's no automatic output-compression hook on Cursor. Use `smart_read` explicitly for large files instead.

**On demand (MCP):** `get_stats`, `trim_context`, `smart_read`.

### Claude Desktop

```bash
npx @ctxlite/cli install --tool claude-desktop --scope global --yes
```

MCP only (`get_stats`, `trim_context`, `smart_read`) — Claude Desktop has no plugin/hook API, global scope only.

### Interactive installer

```bash
npx @ctxlite/cli install
```

Prompts for tools and scope. Add `--remove` to undo any of the above.

## Viewing stats

Every surface above logs to the same `~/.ctxlite/stats.db`, so the CLI always shows the combined total regardless of which tool produced the savings.

**CLI, from any terminal:**

```bash
npx @ctxlite/cli stats              # all-time (default)
npx @ctxlite/cli stats --last 7d
npx @ctxlite/cli stats --last today
npx @ctxlite/cli stats --export json
```

**OpenCode:** the sidebar widget already shows this live. To get the same breakdown in chat:

```
> show me ctxlite's stats
```

**Claude Code:** ask in chat — the agent reaches for the `get_stats` MCP tool:

```
You: how many tokens has ctxlite saved this week?
```

```
You: use the ctxlite get_stats tool and show me the breakdown
```

**Cursor:** same pattern — ask in chat, the agent calls `get_stats` via MCP:

```
You: show me ctxlite's token savings for this project
```

If the agent doesn't reach for the tool on its own (it's opt-in via MCP, not forced), naming the tool explicitly — "use get_stats" / "use the ctxlite MCP tool" — gets it to call it.

---

## Legacy: Go HTTP proxy

The Go binary in `go/` is an earlier architecture: an HTTP proxy with L1 exact-match and L2 semantic caching, configured via env vars + a YAML file. Superseded by the plugin/MCP/hooks setup above — kept here for reference, not the recommended path for new installs.

### CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | `~/.ctxlite/config.yaml` | Config file path |
| `--port` | `8080` | HTTP proxy port |
| `--db` | `~/.ctxlite/cache.db` | SQLite database path |
| `--verbose` | `false` | Enable debug logging |
| `--version` | — | Print version and exit |
| `--upstream-url` | — | Force all traffic to one URL (testing only). Default: pass-through from `Host` header |
| `--max-context` | `4096` | Max tokens kept in trimmed file context |

The HTTP proxy resolves upstream from the request `Host` header. Tools must send the original provider host (e.g. `api.anthropic.com`) when connecting via `OPENAI_BASE_URL` or `ANTHROPIC_BASE_URL`.

### Embedding provider (L2 semantic cache)

| Flag | Default | Description |
|------|---------|-------------|
| `--embedding-url` | — | OpenAI-compatible embeddings API base URL |
| `--embedding-key` | — | API key for the embedding provider |
| `--embedding-model` | `text-embedding-3-small` | Embedding model name |

If no embedding provider is configured, L2 semantic cache is disabled and L1 exact cache still works.  
Set `OPENAI_API_KEY` to enable L2 with the OpenAI embeddings API automatically.

### Config file

Default location: `~/.ctxlite/config.yaml`

Override path:

```bash
ctxlite --config /path/to/config.yaml
```

**Priority order** (highest wins):

1. CLI flags
2. Config file
3. Built-in defaults

**Full example** — `~/.ctxlite/config.yaml`:

```yaml
port: 8080
db: ~/.ctxlite/cache.db
verbose: false

embedding:
  url: http://localhost:11434
  model: nomic-embed-text

trimming:
  max_context_tokens: 8192
  import_graph: true

cache:
  ttl: 48h
  semantic_threshold: 0.90
  max_entries: 20000
```

A missing config file is not an error — ctxlite starts with defaults.

### Environment variables

**Cursor:**

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1
```

Cursor sends requests to the local proxy with the original provider in the `Host` header.

**Claude Code:**

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
```
