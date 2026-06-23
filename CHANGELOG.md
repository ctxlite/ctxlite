# Changelog

All notable changes to ctxlite will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/)

## [Unreleased]

## [0.1.11] - 2026-06-23

### Fixed
- `@ctxlite/core`: hot-path stats loggers (`logTrimResult`, `logConcisenessSavings`, `logOptimizationSavings`) now reuse one writer connection per db path instead of opening/closing SQLite on every call — under concurrent tool calls this caused silent `database is locked` failures that dropped rows
- `@ctxlite/core`: `PRAGMA busy_timeout` set on all three sqlite adapters (`bun:sqlite`, `better-sqlite3`, `node:sqlite`)

### Changed
- `@ctxlite/cli` / `@ctxlite/mcp` / `@ctxlite/opencode`: stats reports now render a shared ASCII bar chart breakdown instead of a plain list
- Default `get_stats` / `ctxlite stats` period changed from `today` to `all`

### Added
- `@ctxlite/opencode`: TUI toast (`client.tui.showToast`) showing per-turn token savings as they happen, instead of requiring an explicit `get_stats` call

## [0.1.10] - 2026-06-22

### Added
- `@ctxlite/opencode`: pre-call tool optimization (`tool.execute.before`) — quiet flags on bash commands, blocks low-signal reads (`node_modules/`, lockfiles, etc.)
- Stats breakdown: `precall` source alongside compress, prune, trim, and concise

## [0.1.9] - 2026-06-22

### Added
- `@ctxlite/opencode`: automatic tool output compression (`tool.execute.after`) — ANSI strip, log folding, head/tail truncate
- `@ctxlite/opencode`: duplicate tool output pruning before each LLM request (`experimental.chat.messages.transform`)
- Stats breakdown: compress + prune logged to `~/.ctxlite/stats.db` alongside trim and concise

## [0.1.8] - 2026-06-22

### Fixed
- Republish: includes Bun `bun:sqlite` + Node `node:sqlite` fallback (0.1.7 on npm was missing these changes)

## [0.1.7] - 2026-06-22

### Fixed
- `@ctxlite/cli` / `@ctxlite/mcp`: fall back to Node 22+ built-in `node:sqlite` when `better-sqlite3` ABI mismatches (fixes `npx @ctxlite/cli stats` crash on Node version change)

## [0.1.6] - 2026-06-22

### Fixed
- `@ctxlite/core`: use `bun:sqlite` under OpenCode (Bun) instead of `better-sqlite3`, fixing Node ABI / MODULE_VERSION mismatch on plugin load

## [0.1.5] - 2026-06-22

### Added
- `@ctxlite/opencode`: track conciseness savings on every completed assistant response via `message.updated` events (~15% of output tokens, logged to stats.db)
- Stats breakdown: trim vs concise in CLI, MCP `get_stats`, and OpenCode `get_stats`

## [0.1.4] - 2026-06-22

### Fixed
- `@ctxlite/opencode` / `@ctxlite/mcp`: record token savings in `~/.ctxlite/stats.db` when `trim_context` trims files

## [0.1.3] - 2026-06-22

### Fixed
- `@ctxlite/opencode`: remove debug `session idle` log that OpenCode showed as an error

### Added (SPEC-016)
- `@ctxlite/cli install` — interactive installer for Cursor, OpenCode, Claude Code, and Claude Desktop (global or project scope)
- Renamed CLI package from `ctxlite` to `@ctxlite/cli` (unscoped npm name taken)

### Added (SPEC-015)
- GitHub Actions CI for TypeScript monorepo (typecheck, build, test, lint, version sync, MCP console.log guard)
- GitHub Actions release workflow publishing `@ctxlite/core`, `@ctxlite/opencode`, `@ctxlite/mcp`, and `@ctxlite/cli` to npm on tag

### Added (SPEC-014)
- `@ctxlite/cli` package with `stats` subcommand, period filters, and JSON export

### Added (SPEC-013)
- `@ctxlite/mcp`: MCP stdio server for Cursor with `get_stats` and `trim_context` tools

### Added (SPEC-012)
- `@ctxlite/opencode`: OpenCode plugin with system prompt conciseness injection, `get_stats` and `trim_context` tools

### Added (SPEC-011)
- `@ctxlite/core`: BM25 scoring, file parser, import graph, trimmer, token counting, SQLite stats store

### Added (SPEC-010)
- Monorepo setup cu npm workspaces
- TypeScript shared config (eslint, prettier, vitest)
- Placeholder packages: @ctxlite/core, @ctxlite/opencode, @ctxlite/mcp, @ctxlite/cli

### Changed (SPEC-02-addendum)
- HTTP proxy uses pure pass-through upstream resolution from the `Host` header (works with any provider)
- Replaced `--anthropic-url` / `--openai-url` with optional `--upstream-url` (testing only)
- Removed `anthropic_url` / `openai_url` from config file; documented per-tool setup and OpenCode MCP-only integration

### Added (SPEC-08)
- CLI subcommands: `stats`, `cache stats`, `cache clear` (with `--l1` / `--l2` selective clear)
- YAML config file support (`~/.ctxlite/config.yaml`) with CLI flag override priority
- Extended stats summary (L1/L2 hits, trim savings, avg latency) and `SummaryFrom` period queries

### Added

- GitHub Actions CI (multi-OS tests, lint, npm validation) and release workflow
- Local release alternative: `./scripts/release.sh` and `make ci` when Actions minutes are unavailable
- Version injection via `-ldflags` at build time

### Added (SPEC-06)
- Local npm testing targets: `npm-version`, `npm-install-local`, `npm-pack`

### Added (SPEC-04)
- Real token usage parsing from Anthropic/OpenAI responses (including SSE streams)
- `--max-context` flag for trimmer token budget

### Added (SPEC-03)
- Cache hooks wired into HTTP proxy handler
- Embedding provider flags and `OPENAI_API_KEY` auto-detection
- Background TTL/LRU eviction for L1 cache

### Added (SPEC-02)
- SSE streaming passthrough for coding tool compatibility
- Request logging to SQLite and stderr one-liners (`[ctxlite] MISS ...`)
- CLI/env upstream URL overrides (`--anthropic-url`, `--openai-url`)

### Added (SPEC-01)

- Initial repository structure
- HTTP proxy entry point (placeholder)
- SQLite stats store with session summary
- Graceful shutdown with SIGTERM/SIGINT handling
- CLI flags: --port, --db, --verbose, --version
