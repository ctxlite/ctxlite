# Configuration

This page covers the current plugin/MCP/hooks architecture. **`ctxlite install`
now only offers OpenCode** — Cursor, Claude Code, and Claude Desktop sections
below describe capability that still exists in the codebase (a prior install
on one of those hosts keeps working) but is no longer offered by the
installer, while ctxlite's efficiency work focuses on OpenCode specifically.
See [docs/benchmarks.md](benchmarks.md) for the measured numbers behind that
focus. For the legacy Go HTTP proxy, see [Legacy: Go HTTP proxy](#legacy-go-http-proxy) at the bottom — it's a separate, superseded architecture with its own config file and env vars.

## Install

### OpenCode

```bash
npx @ctxlite/cli install --tool opencode --scope global --yes
# or, using OpenCode's own installer:
opencode plugin @ctxlite/opencode -g -f
```

Writes two files: `~/.config/opencode/opencode.json` (server-side plugin only — **not** `mcpServers`; OpenCode rejects that key) and `~/.config/opencode/tui.json` (TUI-side plugin: the sidebar widget). Use `--scope project` to scope to the current repo instead (`opencode.json` / `tui.json` in the project root).

**Automatic, no action needed:**

- Pre-call rewrite — quieter flags on `bash` commands, blocks low-signal reads (`node_modules/`, lockfiles), and hard-blocks a full `read` of a large file in favor of `smart_read` (redirecting the agent to retry) unless the same path was already engaged this session via `smart_read` or an edit/write call
- Tool output compression — ANSI strip, log folding, head/tail truncation for large output
- Stale-output capping and duplicate-output pruning across the conversation history before each request
- Conciseness instructions injected into the system prompt (including: never use a markdown table for lists)
- Sidebar widget showing live savings, a toast after each turn, and a `· ctxlite: X saved` suffix on the session title

**On demand (plugin tools):** `get_stats`, `trim_context`, `smart_read`, `concise_reply` (schema-forced short-answer tool for pure explain/list turns).

> **Known gap**: the four MCP-only tools (`diff_read`, `log_summary`, `code_search`, `budget_planner`) are not available on OpenCode — they were only ever wired up for Cursor/Claude Code via MCP, which is now disabled. Porting them to the OpenCode plugin is untracked, unscoped follow-up work, not something this release does.

### Cursor / Claude Code / Claude Desktop — install disabled

`ctxlite install --tool cursor` (or `claude-code` / `claude-desktop`) is
**rejected** by the CLI as of v0.2.0 — `Unknown tool "cursor". Valid: opencode, all`.
The underlying merge/path logic for these hosts (`packages/core/src/install/`)
is still in the codebase and still tested, so an install done before v0.2.0
keeps working and can still be removed with `ctxlite install --remove` if you
call the lower-level install functions directly — but there is no supported
CLI path to create or update one anymore. Previously: Claude Code and Cursor
each got a PreToolUse-style pre-call rewrite hook and MCP access to all seven
tools (`get_stats`, `trim_context`, `smart_read`, `diff_read`, `log_summary`,
`code_search`, `budget_planner`); Claude Desktop got MCP access only. None of
that is offered by `ctxlite install` going forward.

### Interactive installer

```bash
npx @ctxlite/cli install
```

Prompts for scope (there's only one tool to choose now). Add `--remove` to undo.

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

If the agent doesn't reach for the tool on its own, naming it explicitly — "use get_stats" — gets it to call it.

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
