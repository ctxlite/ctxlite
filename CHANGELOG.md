# Changelog

All notable changes to ctxlite will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/)

## [Unreleased]

## [0.1.23] - 2026-06-23

### Added
- `optimizeBashCommand` now recognizes more noisy-by-default commands: `npm install`/`ci`, `pip install`, `composer install`/`update`, `bundle install`, `mvn <goal>`, `gradle`/`./gradlew <task>`, `make <target>`, `vite build` — same conservative approach as the existing rules (only suppress progress/noise, never suppress actual findings like lint warnings).
- `compressGrepOutput()` / `compressOutputForTool()` — Grep's content-mode output (`file:line:text` per match) is grouped by file and capped per-file and per-file-count, instead of `compressToolOutput`'s blind head/tail truncation, which would show every match from the first few files and none from the rest. Wired into both OpenCode's and Claude Code's PostToolUse-equivalent compress hooks (Cursor's `postToolUse` still can't rewrite built-in tool output, confirmed in 0.1.20 — no equivalent there).

### Fixed
- Investigated whether Claude Code has any hook giving access to the full conversation history before a model request (OpenCode's `experimental.chat.messages.transform` equivalent, which `prune` relies on). Confirmed against current docs: no such hook exists — `UserPromptSubmit` only fires on user input, not every agentic round-trip, and can't rewrite history; `PreCompact` can only block, not rewrite. Documenting this as a real platform limitation rather than leaving it as an open question.
- A regex word-boundary bug meant the `./gradlew <task>` form (the actual common invocation) never matched the new gradle quiet-flag rule — `\b` doesn't fire before a non-word character (`.`) at the start of a string. Caught by the test for it before shipping.
- **The precall rewrite matched tool names mentioned in prose, not just real invocations.** Committing this very release failed: the commit message said "npm install/ci" in a sentence, which `optimizeBashCommand` matched as an actual `npm install` call and rewrote — inside a heredoc, no less, so the existing shell-chaining guard didn't apply (no top-level `&&`/`|`/`;`). Fixed by blanking out quoted strings and heredoc bodies before pattern matching (`stripEmbeddedText`), so only actual command syntax is checked — the flag is still applied to the real, unblanked command text.

## [0.1.22] - 2026-06-23

### Added
- Per-session/per-host stats tracking: `requests` table gains `host` (`opencode`/`claude-code`/`cursor`/`mcp`) and `session_id` columns, migrated in automatically for existing databases. Threaded through every logging call site across all four integrations — real session/conversation ids for OpenCode (`sessionID`), Claude Code (`session_id`), and Cursor (`conversation_id`) hooks; a per-process pseudo-session id for MCP, which has no real session id in its protocol.
- `StatsStore.summaryForSession(host, sessionId)` and `StatsStore.sessionBreakdown(since)`.
- `ctxlite stats --by-session` — breaks the total down by host, then by session, instead of one combined number.
- OpenCode's `get_stats` tool and the sidebar widget now default to **the current session**, not an ever-growing all-time total — matching the MCP `get_stats` tool, which defaults to its own process-lifetime pseudo-session for the same reason. Pass an explicit `period` to get the old all-sessions behavior.
- OpenCode's toast/session-title savings counters are now also session-scoped, fixing a latent bug where switching chat tabs would compare one session's delta against a different session's baseline.

### Fixed
- **Compound bash commands were getting silently corrupted by ctxlite's own pre-call optimization.** `appendFlag()` always stuck the quiet flag on the *end* of the whole command string, assuming the matched command (`npm test`, `npm run build`, etc.) was the last thing in it. For `npm run build 2>&1 | tail -20`, this produced `... | tail -20 --loglevel=warn` — a flag on the wrong command, breaking `tail`. Found live: this exact command failed while building this release, via the real PreToolUse hook configured for this conversation. Now skips the rewrite entirely whenever the command contains `&&`, `||`, `;`, or `|` — a missed optimization is harmless, a wrongly-placed flag isn't.
- **`ctxlite stats --last <period>` (and `--export`, `--db`) were silently ignored** when placed after the subcommand, the conventional order shown in the CLI's own `--help` text — `parseArgs` returned as soon as it saw the subcommand token, before reaching the flag-parsing switch. `--last today` and `--last all` produced byte-identical output. Fixed without touching `install`/`hook`'s own flag parsing (which still owns everything in their `rest` array). Extracted `parseArgs`/`runStats` out of the CLI's `#!/usr/bin/env node` entry point into a separate, importable module so this has actual test coverage now — there was none before, which is exactly how this went unnoticed.
- **The MCP test suite was writing real rows into the user's actual `~/.ctxlite/stats.db` on every `npm test` run.** `smart-read.test.ts`, `trim-context.test.ts`, and `get-stats.test.ts` never mocked `os.homedir()`, unlike every other test file that touches stats storage. This is very likely the source of the several stray single-digit-K "MCP" pseudo-sessions visible in `--by-session` output on developer machines that ran the test suite.

## [0.1.21] - 2026-06-23

### Fixed
- `savingsPercent` was showing a misleading 100% (reported by the user on two machines, "456K of 456K" and "1.1M of 1.1M"). Root cause was two compounding measurement mismatches:
  1. `trim_context` measures savings against candidate files the agent chose to evaluate, not files that were necessarily about to enter context — it has no real session baseline to compare against, unlike compress/prune/compact/precall/smart_read (all measured before/after on content actually entering a request). Heavy `trim_context` use dominated the numerator.
  2. `concise` saves *output* tokens but was being weighed against an *input-only* session baseline (`sessionTokensUsed` only tracked `tokens.input`).
- `trim_context`'s savings are now excluded from `savingsPercent`'s numerator (new `Summary.realtimeTokensSaved` field — still shown on its own in the breakdown) and `logSessionUsage` now tracks output/reasoning tokens too (`tokens_out` on the same `session` row), so input-side and output-side savings are each compared against their own matching baseline before being combined. Verified against a simulated realistic session: dropped from a false 100% to a plausible 34.5%.

## [0.1.20] - 2026-06-23

### Added
- `@ctxlite/cli hook cursor-pre-tool-use` — Cursor's equivalent of the Claude Code PreToolUse hook (`preToolUse` in `.cursor/hooks.json`, flat `{command, ...}` entries rather than Claude Code's matcher-group nesting). Reuses the same `optimizeToolArgs` logic (Bash/Shell quiet flags, blocks low-signal reads).
- `@ctxlite/cli install --tool cursor`: now also registers this hook in `~/.cursor/hooks.json` (global) / `.cursor/hooks.json` (project), alongside the existing MCP registration.

### Note
- Investigated whether Cursor can replicate the automatic output-compression hook ("compress") that OpenCode and Claude Code have: it cannot. Verified against Cursor's official hooks docs that `postToolUse`'s output-replacement (`updated_mcp_tool_output`) only works for MCP tools, not built-in ones (`Shell`, `Read`, `Write`) — so large-output compression has no automatic path on Cursor and stays opt-in via the `smart_read` MCP tool.
- README.md and docs/configuration.md rewritten: per-tool tables of what's automatic vs. on-demand, and concrete stats-viewing chat examples for Claude Code and Cursor (previously only OpenCode had one). docs/configuration.md's legacy Go HTTP-proxy config was previously presented as current setup instructions, mixed in with the actual plugin/MCP/hooks docs — now clearly separated under "Legacy: Go HTTP proxy."

## [0.1.19] - 2026-06-23

### Added
- `@ctxlite/cli hook pre-tool-use` / `hook post-tool-use` — bridges ctxlite's core optimizations into Claude Code's PreToolUse/PostToolUse hooks (verified JSON schema against current docs: `hookSpecificOutput.updatedInput`/`updatedToolOutput`). Unlike the MCP tools (opt-in, the agent has to remember to call them), hooks fire automatically on every tool call via a `"*"` matcher — same automatic behavior OpenCode's plugin hooks already give. PreToolUse reuses `optimizeToolArgs` (Bash quiet flags, blocks low-signal reads); PostToolUse reuses `compressToolOutput` (head/tail truncate for large output). Deliberately does NOT auto-apply symbol-only extraction to every Read — that's a much lossier transform than truncation and stays opt-in via the `smart_read` MCP tool, where the agent explicitly chooses it.
- `@ctxlite/cli install --tool claude-code`: now also registers these hooks in `.claude/settings.json` (project) / `~/.claude/settings.json` (global) — a different file from the MCP server config — appending to any existing hook matcher groups rather than overwriting them.
- Any hook payload that doesn't parse as expected is a silent no-op (exit 0, no output) — a malformed/unexpected shape must never block the user's actual tool call.

## [0.1.18] - 2026-06-23

### Added
- `@ctxlite/mcp`: `smart_read` tool, ported from `@ctxlite/opencode` — same symbol-extraction/budgeted-fallback logic, now available to Cursor and Claude Code, not just OpenCode. Paths resolve absolute-first, falling back to the MCP server's own `process.cwd()` (no `context.directory` equivalent in MCP).

## [0.1.17] - 2026-06-23

### Added
- `@ctxlite/opencode`: `smart_read` tool — reads a file itself (no pre-read content required, unlike `trim_context`) and returns declaration signatures with bodies blanked, via real tree-sitter parsing (`web-tree-sitter` + WASM grammars for TypeScript/TSX/JavaScript, no native compilation). Closes the actual gap vs. `@tokenwarden/opencode`'s `smart_read`/`smart_pack`, which intercept *before* the agent ever reads full file content — `trim_context` only filters *after*. Falls back to a budgeted head/tail read for unsupported languages. System prompt nudges the model to prefer it for understanding file shape over editing.
- `@ctxlite/core`: `extractSymbols()` / `supportsSymbols()` — verified against 9 real parse cases (functions, exported arrows, class methods, interfaces/types/imports kept intact, `.tsx` JSX, plain `.js`).

### Note
- Adds ~50MB to `@ctxlite/core`'s installed size (`web-tree-sitter` + `tree-sitter-typescript` + `tree-sitter-javascript`, mostly the TypeScript grammar's prebuilt native sources that ship alongside its `.wasm`). Scoped to TS/TSX/JS/JSX only for now — other languages fall back to budgeted reads.
- Verified working under Node (103 tests, real WASM parsing). Not yet verified under OpenCode's actual Bun runtime — this machine has no standalone Bun binary to test against; needs live verification after publishing.

## [0.1.16] - 2026-06-23

### Added
- `@ctxlite/core`: `capStaleToolOutputs()` — caps large completed tool outputs in older messages to a token budget (default 600), regardless of whether they're duplicates. Closes a real gap vs. competing plugins (reverse-engineered `@tokenwarden/opencode`'s `messages.transform` pass): `pruneMessageContext` only removed exact-duplicate calls, so a single large unique read/grep early in a long session stayed at full size in every subsequent request. The most recent message is left untouched so the model keeps full fidelity on what it just produced. Logged under a new `compact` source, shown as its own row in all stats reports.
- `@ctxlite/opencode`: hooks `experimental.session.compacting` to inject a continuation checklist (file paths, decisions made, commands run, failed approaches, test status) into OpenCode's own context-compaction summary, so the next turn doesn't have to re-read/re-discover what's already known.
- `@ctxlite/opencode`: system prompt now nudges the model to call `trim_context` after reading several candidate files for a multi-file task, instead of carrying all of them forward unfiltered.

## [0.1.15] - 2026-06-23

### Changed
- `savingsPercent`/`tokensBefore` now compare against actual total session traffic (`sessionTokensUsed`, tracked from `message.updated`'s real input-token count on every completed turn) instead of just the subset of content ctxlite touched. Answers "13% of what?" — previously the denominator was only the optimized rows themselves, which made the percentage read as "% of total usage" when it wasn't.
- When no session traffic has been tracked yet (`sessionTokensUsed === 0`, e.g. right after upgrading), shows "X saved (no session baseline yet)" instead of a misleading 100%.
- `@ctxlite/opencode` sidebar widget now renders the full ASCII bar chart (same as CLI/`get_stats`) plus the cost-saved line, instead of a compact label-only list.

### Added
- `@ctxlite/core`: `logSessionUsage()` — persists real per-turn input tokens as the denominator baseline; not itself a "saving".

## [0.1.14] - 2026-06-23

### Added
- `Summary` now reports `tokensBefore` (tokens that would have been used without ctxlite: `tokensUsed + tokensSaved`) and `savingsPercent` (`tokensSaved / tokensBefore * 100`). Surfaced as "saved X of Y (Z%)" in the CLI, OpenCode `get_stats`, MCP `get_stats`, and the sidebar widget.

## [0.1.13] - 2026-06-23

### Added
- `@ctxlite/opencode`: experimental persistent sidebar widget (`tui.tsx`, `sidebar_content` slot via `@opentui/solid`) showing the stats breakdown at all times, not just as a transient toast. Ships as a separate `oc-plugin: ["server", "tui"]` target per OpenCode's plugin conventions — untested against a real OpenCode/Bun TUI session, needs live verification.
- `@ctxlite/opencode`: also appends a `· ctxlite: <total> saved` suffix to the session title (via `client.session.update`) on each turn with new savings, replacing any prior suffix — a second, more persistent surface than the toast alone.
- `@ctxlite/cli install --tool opencode`: now also registers `@ctxlite/opencode` in `tui.json` (separate from `opencode.json`), required for the sidebar widget to load.

## [0.1.12] - 2026-06-23

### Fixed
- `@ctxlite/cli install --tool opencode`: clears OpenCode's own stale plugin cache (`~/.cache/opencode/packages/@ctxlite`) and re-runs `opencode plugin @ctxlite/opencode --force` — OpenCode pins a plugin's "latest" resolution at first install and never re-resolves it on its own, so installs could get stuck on a months-old cached version even after publishing newer ones. Best-effort: no-ops if the `opencode` CLI isn't on PATH.

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
