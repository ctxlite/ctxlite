# Architecture

This document describes the current TypeScript monorepo. The original Go HTTP
proxy is a separate, legacy distribution channel — see
[Legacy: Go HTTP proxy](#legacy-go-http-proxy) at the end of this document.

## Overview

ctxlite is four npm packages sharing one SQLite database:

```
packages/
├── core/      @ctxlite/core      — all business logic; the other three import from it, never duplicate it
├── opencode/  @ctxlite/opencode  — OpenCode plugin (server hooks + TUI sidebar widget)
├── mcp/       @ctxlite/mcp      — MCP stdio server, used by Cursor, Claude Code, Claude Desktop
└── cli/       @ctxlite/cli      — `ctxlite stats` / `ctxlite install` / the hook bridge processes
```

`@ctxlite/core` has no dependency on any host platform — it's pure functions
plus the SQLite stats store. `opencode`, `mcp`, and `cli` are thin adapters:
each translates one host's plugin/hook API into calls against `core`, and
nothing else. If you're adding a new optimization, it belongs in `core`; if
you're wiring an existing one into a new host, it belongs in the adapter
package for that host.

## The seven optimization mechanisms

Every token-saving mechanism logs to the `requests` table with a `source`
column — this is also what the `precall` / `compress` / `prune` / `compact`
/ `smart_read` / `trim` / `concise` rows in `ctxlite stats` correspond to.

| source | What it does | Where it lives | Trigger |
|---|---|---|---|
| `precall` | Rewrites a bash command to add quiet flags (`npm test` → `--silent`, etc.), or blocks a low-signal file read (`node_modules/`, lockfiles) | `core/tool-precall.ts` | Before a tool call runs — `tool.execute.before` (OpenCode), `PreToolUse` (Claude Code), `preToolUse` (Cursor) |
| `compress` | Truncates a tool's output if it's large, or buckets `grep`-style output by file | `core/tool-output-compress.ts`, `core/grep-output-compress.ts` | After a tool call returns — `tool.execute.after` (OpenCode), `PostToolUse` (Claude Code). **Not available on Cursor** — its `postToolUse` can only replace output for MCP tools, not built-in ones (`Shell`/`Read`/`Write`) |
| `prune` | Replaces a tool output with a placeholder when the exact same call (same tool + args) already appears earlier in the conversation | `core/context-prune.ts` (`pruneMessageContext`) | Before each model request, given the full message list — `experimental.chat.messages.transform` (OpenCode only; no host other than OpenCode exposes the full message history to a hook) |
| `compact` | Caps any large tool output in an older (non-latest) message to a fixed token budget, regardless of duplication | `core/context-prune.ts` (`capStaleToolOutputs`) | Same hook as `prune` (OpenCode only) |
| `smart_read` | Returns a file's signatures (functions/classes/types/exports) with bodies blanked, instead of full content | `core/smart-read.ts` | Agent-initiated MCP/plugin tool call — never automatic, the agent has to decide to call it |
| `trim` | Scores a list of candidate files against a task description (BM25 + import-graph boosting) and drops the irrelevant ones | `core/trimmer.ts`, `core/bm25.ts`, `core/imports.ts` | Agent-initiated tool call (`trim_context`) |
| `concise` | A flat percentage estimate of tokens saved by the conciseness instructions injected into the system prompt | `core/tokens.ts` (`estimateConcisenessSavings`) | Logged on every completed assistant turn — `message.updated` event (OpenCode only; no equivalent measurement exists for Claude Code/Cursor, see below) |

`precall`/`compress` are automatic on every matching tool call. `prune`/
`compact`/`concise` are automatic on every request, but only on OpenCode —
no other host exposes the hook they need (confirmed against both Claude
Code's and Cursor's complete current hook-event documentation: neither
exposes the full conversation message array `prune`/`compact` need, and
neither documents per-turn token usage in any hook payload, which `concise`
measurement would need — `specs/021-conciseness-instructions-non-opencode/`
has the full investigation). `concise`'s *instructions* (not its
measurement) are the one part of this gap that's closeable without relying
on undocumented internals — Claude Code and Cursor each get the same
instructions via a dedicated, always-loaded rule file instead
(`core/install/conciseness-rule-content.ts` → `.claude/rules/` /
`.cursor/rules/`, alongside the skill files below). `smart_read`/`trim` are
entirely opt-in: the agent has to decide to call them, which is why a
[skill](#skills) exists to nudge that decision (see below).

## Per-host integration

### OpenCode (`packages/opencode`)

A single plugin (`src/index.ts`) registers everything OpenCode's plugin API
supports: `tool.execute.before`/`after` (precall/compress),
`experimental.chat.messages.transform` (prune/compact),
`experimental.chat.system.transform` (conciseness instructions injection),
`experimental.session.compacting` (a continuation checklist appended when
OpenCode summarizes a long session), an `event` handler (toast + session
title updates), and three tools (`get_stats`, `trim_context`, `smart_read`).
A separate TUI plugin (`src/tui.tsx`, Solid.js via `@opentui/solid`) renders
the sidebar widget — it's a different plugin entry (`tui.json`, not
`opencode.json`) because OpenCode loads TUI-side and server-side plugins
from separate config files.

OpenCode resolves a plugin version once and pins it in its own
`~/.cache/opencode/packages/<pkg>` cache, never re-resolving "latest" even
after a new version is published — `ctxlite install` clears that cache
directory before reinstalling (`core/install/opencode-refresh.ts`), or the
user keeps seeing a stale plugin version indefinitely.

### Claude Code and Cursor (`packages/mcp` + `packages/cli`)

Two independent integrations, both pointed at the same host:

- **MCP server** (`packages/mcp`) exposes `get_stats`/`trim_context`/
  `smart_read` as MCP tools. MCP gives tool handlers no real session id, so
  `shared.ts` generates one random id per server process as an
  approximation (`MCP_PROCESS_SESSION_ID`) — accurate as long as the host
  spawns one `npx @ctxlite/mcp` process per session, which both hosts do.
- **Hook bridge** (`packages/cli/src/hook.ts` for Claude Code,
  `cursor-hook.ts` for Cursor) is a short-lived CLI process the host invokes
  per tool call, piping a JSON event on stdin and reading a JSON response
  from stdout. This is what implements `precall`/`compress` outside OpenCode.
  Claude Code's hook config (`PreToolUse`/`PostToolUse` in `settings.json`)
  uses matcher-grouped arrays; Cursor's (`preToolUse` in `hooks.json`) is a
  flatter shape — `core/install/merge.ts` has one merge function per shape,
  both written to append a ctxlite entry without disturbing the user's other
  hooks on the same event.

Claude Desktop only gets the MCP server — it has no hook or plugin API at
all, so `precall`/`compress` aren't possible there.

### Installer (`packages/core/src/install`)

`ctxlite install --tool <id> --scope <global|project>` is the single entry
point that writes every config file above. `paths.ts` resolves the exact
path per tool+scope (e.g. `~/.cursor/hooks.json` vs `.cursor/hooks.json`);
`merge.ts` reads the existing file (if any) and adds only ctxlite's own
entries, preserving everything else; `run.ts` diffs what would change
(`--dry-run`) before writing. Re-running `install` is always safe — it's
how an existing setup picks up a newly added install target after an
upgrade (this is exactly what happened when Cursor hooks were added in
v0.1.20: installs done before that version only had `mcp.json` until
`install` was run again).

## Skills

Claude Code, Cursor, and OpenCode all read the same skill format — YAML
frontmatter (`name`, `description`) plus a Markdown body, in a `SKILL.md`
file under a `<name>/` folder. `ctxlite install` writes one (
`core/install/skill-content.ts`) for each host, documenting when to use
`smart_read`/`trim_context` — this exists because the MCP server's generic
`instructions` field alone wasn't reliably nudging models toward calling
those two tools, and a host-native skill is more likely to actually be
read. OpenCode additionally auto-discovers skills written for Claude Code
(`~/.claude/skills/`), so the two aren't fully redundant even though only
one needs to be installed per host.

`ctxlite install` also writes a second, separate always-loaded file per
host — `.claude/rules/ctxlite-conciseness.md` (Claude Code) and
`.cursor/rules/ctxlite-conciseness.mdc` (Cursor, `alwaysApply: true`) — the
conciseness instructions OpenCode already gets via its own unconditional
system-prompt injection (`core/install/conciseness-rule-content.ts`). This
is a separate mechanism from the skill above: a skill is *discovered* by
the host on its own when relevant, while a rules-directory file is loaded
into every session unconditionally, the same way `CLAUDE.md` is — there is
no equivalent "always loaded" injection point for OpenCode's own plugin
hooks to skip, so OpenCode doesn't need this second file.

## Stats storage

One SQLite database (`~/.ctxlite/stats.db`, `core/stats.ts`) shared by every
package and every host. Each row in the `requests` table records `source`
(the mechanism, per the table above), `host` (`opencode` / `claude-code` /
`cursor` / `mcp`), `session_id`, and token/cost figures. `host`+`session_id`
is what `ctxlite stats --by-session` groups by, and what `get_stats`
defaults to when called without an explicit period (today's session, not
an ever-growing all-time total).

Two runtimes open this database differently — OpenCode runs under Bun
(`bun:sqlite`), everything else runs under Node (`better-sqlite3`, falling
back to Node 22+'s built-in `node:sqlite` if the native addon's
`MODULE_VERSION` doesn't match the running Node version). `core/sqlite-adapter.ts`
picks the right one at runtime via `isBunRuntime()`; both are wrapped behind
the same `StatsSqlite` interface so the rest of `core` never branches on
runtime.

Long-lived processes (the OpenCode plugin, an MCP server) reuse one open
connection per database path (`getSharedStore` in `stats.ts`) instead of
opening and closing per call — opening per call caused silent dropped
writes under concurrent tool calls before this existed (`SQLITE_BUSY`
swallowed by a try/catch). Short-lived processes (the CLI, the per-call
hook bridge) just open and close normally, since there's no concurrency
within a single process invocation.

## Legacy: Go HTTP proxy

The original implementation (`go/`, `npm/`) was a transparent HTTP proxy:
point `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL` at `127.0.0.1:8080`, and it
cached exact + semantically-similar requests and ran a BM25 context trimmer
before forwarding upstream, using the request's `Host` header to determine
the real provider (no per-provider detection logic, so any provider works
without code changes). It's still distributed as platform binaries under
`npm/`, but all new development happens in the TypeScript packages above —
the proxy approach didn't generalize to tools (like OpenCode and Claude
Code's own hooks) that don't route every request through a configurable
HTTP endpoint.
