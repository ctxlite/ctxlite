---
name: ctxlite-internals
description: >-
  Use when modifying packages/core/src/tool-precall.ts (bash command
  rewriting), packages/core/src/ctxliteignore.ts (project-configurable
  ignore patterns), packages/core/src/install/ (per-host config paths), the
  SQLite schema in packages/core/src/stats.ts, or anything that ships a new
  quiet-flag/build-tool rule. These are the areas where ctxlite has shipped
  real regressions before — read this first.
---

# ctxlite internals — areas that have actually broken in production

Each rule below exists because of a specific bug that shipped, not a
hypothetical. Treat them as load-bearing, not style preferences.

## `tool-precall.ts` — bash command rewriting

This file rewrites commands like `npm test` → `npm test --silent` before
they run. A wrong rewrite doesn't just miss an optimization — it corrupts
the user's actual command. Three real bugs shipped here:

1. **Flag landed on the wrong command in a pipe/chain.** `npm run build |
   tail -20` became `npm run build | tail -20 --loglevel=warn`, breaking
   `tail`. Fixed by splitting on top-level shell operators
   (`splitTopLevel`) and rewriting only the matched segment — never append
   a flag to the raw, un-split command string.
2. **A regex word-boundary bug silently never matched.** `\b(gradle|\.\/gradlew)`
   never matched `./gradlew build` because `\b` doesn't fire before a
   non-word character (`.`) at the start of a string. A missing match is
   silent — it just never optimizes — so this kind of bug ships unnoticed
   without a test for the *exact* real invocation form (`./x`, bare `x`,
   `x.cmd`, `x.bat`).
3. **A tool name mentioned in prose got rewritten as a real invocation.**
   `git commit -m "fix npm install bug"` — and worse, the same thing
   inside a heredoc — got matched as an actual `npm install` call and
   rewritten, corrupting the commit message. Fixed by `stripEmbeddedText`
   blanking quoted strings and heredoc bodies before any pattern check.

**When adding a new quiet-flag rule:**
- Verify the flag actually exists for that tool's *current* version —
  check the tool's own docs, don't rely on training-data memory. A
  hallucinated flag breaks the command outright.
- Match against `segmentSkeleton` (post-`stripEmbeddedText`, post-segment-
  split), never the raw `segment`/`command` string directly.
- Cover the wrapper-script and Windows forms if the tool has them (`mvn` →
  also `mvnw`, `./mvnw`, `mvnw.cmd`/`.bat`; `gradle` → also `gradlew`,
  `./gradlew`, `gradlew.bat`).
- Add a regression test for: the bare command, a chained form (`cmd1 &&
  <new rule> | tail`), and the tool name appearing inside a quoted string
  (must NOT rewrite).

## `ctxliteignore.ts` — project-configurable ignore patterns

Reads an optional `.ctxliteignore` from the project root (gitignore-style
syntax, deliberately limited subset — `*`, `**`, trailing `/` for
directories, `#` comments — no negation, no character classes, no new
dependency added to support it: see `specs/018-ctxliteignore-support/`).
Two call sites consume it independently: `tool-precall.ts`'s
`optimizeReadPath`/`optimizeToolArgs` (via an optional `cwd` parameter) for
blocking reads, and both `trim_context` tool implementations
(`packages/opencode/src/tools.ts`, `packages/mcp/src/tools/trim-context.ts`)
for filtering candidates before BM25 scoring.

- The file is read fresh on every call (`loadIgnorePatterns(cwd)`), never
  cached — a maintainer editing `.ctxliteignore` must see the effect on the
  very next tool call, not after a host restart.
- A malformed line must never throw and must never disable the rest of the
  file — `compilePattern` returns `null` for anything that fails to
  compile, and the caller just skips that one line.
- `trimmer.ts`/`bm25.ts` deliberately know nothing about this file — the
  filtering happens at the tool layer, one call site per host, before
  `trimFiles` is ever invoked. Don't move this filtering into `trimFiles`
  itself; that would force filesystem-awareness (and cwd-mocking) into a
  module whose tests are currently pure and filesystem-free.
- OpenCode's `trimContextTool` has `context.directory` available directly
  on its `ToolContext` — use that instead of `process.cwd()` there. The
  CLI/Cursor/OpenCode *precall* hook bridges and the MCP `trim_context`
  tool have no such context object, so they use `process.cwd()`, matching
  the convention already established in `packages/mcp/src/tools/smart-read.ts`.

## `core/install/` — per-host config paths

Every path in `paths.ts` is a claim about where a specific host reads its
config from. Getting this wrong doesn't error — it silently writes a file
the host never reads, and the feature appears to do nothing.

- Don't guess a path from a different host's convention. Cursor's
  user-installed skills live at `~/.cursor/skills/`, NOT
  `~/.cursor/skills-cursor/` — that directory is reserved for Cursor's own
  *bundled* meta-skills (`create-hook`, `create-rule`, etc.); writing there
  would be both wrong and presumptuous.
- Verify against the host's own introspection when one exists (e.g.
  `opencode debug skill` lists every skill it discovered, with its
  resolved `location` — this is how the global OpenCode skill path
  (`~/.config/opencode/skills/<name>/SKILL.md`) was confirmed correct, not
  assumed).
- A path that's correct in code still doesn't help existing installs:
  `ctxlite install` only writes a *new* install target (e.g. Cursor hooks,
  added in v0.1.20) on a run *after* that target was added. An install
  done before that version has to re-run `install` to pick it up — this is
  expected, not a bug, but call it out in the CHANGELOG when adding a
  target so users know to re-run.
- Test against a real install when the host supports a CLI/headless mode
  (`cursor-agent -p`, `opencode run`) — a unit test proves the merge logic
  is right, but only a real host process proves the file is in the right
  place and the host actually reads it.

## SQLite schema (`core/stats.ts`)

`requests.host` and `requests.session_id` were added after the table
already existed in the wild. The migration pattern is `ALTER TABLE ... ADD
COLUMN` wrapped in try/catch, run after `CREATE TABLE IF NOT EXISTS` —
this must stay idempotent (safe to run against both a fresh DB and an
existing one that already has the column). Never assume an existing user's
`~/.ctxlite/stats.db` already has a column you're about to add.

Two SQLite backends exist (`bun:sqlite` for the OpenCode/Bun runtime,
`better-sqlite3`/`node:sqlite` for everything else under Node) behind one
`StatsSqlite` interface in `sqlite-adapter.ts`/`sqlite-bun.ts`. A change to
the schema or query layer needs both backends to stay in sync — there's no
shared SQL execution path between them, just a shared interface shape.

**On PRAGMA calls specifically**: both backends call `PRAGMA`
(`journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`) via
direct string interpolation (`PRAGMA ${source}` inside better-sqlite3's own
`pragma()` method, `db.exec`/`db.run` with a literal template in ours) —
this is not a bug, it's the only way any SQLite driver implements PRAGMA,
since SQLite's grammar doesn't support bound parameters for it. It's
*safe* here only because all three call sites pass hardcoded literals,
never external input (investigated and confirmed in
`specs/017-better-sqlite3-security-audit/spec.md` after a Socket.dev scan
flagged the pattern). If a future PRAGMA call takes a variable argument —
an exposed "vacuum" or "integrity_check" admin tool, say — that call MUST
go through the Implementation Heuristic Gate (constitution Principle VI)
with the Risk question answered specifically against this exact injection
pattern, not waved off as "it's just a PRAGMA."

## Don't mock the filesystem; do mock `os.homedir()`

Tests use real temp directories (`mkdtempSync`) for actual file I/O — never
fake the filesystem itself. But several modules compute a path like
`join(homedir(), ".ctxlite", "stats.db")` **once, at module import time**
(`packages/mcp/src/shared.ts`, `packages/cli` hook bridges). If
`os.homedir()` isn't mocked *before* that import happens, the test reads
and writes the real `~/.ctxlite/stats.db` — this has actually polluted the
real database with test rows before. The fix is always: create the temp
home directory and call `vi.mock("os", ...)` at module top level, then
`await import(...)` the module under test dynamically, in that order — a
`beforeEach` runs too late for a constant frozen at import time.
