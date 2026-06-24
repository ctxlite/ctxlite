# Data Model: `.ctxliteignore` Support

No database/schema changes. Two lightweight, in-memory entities, both purely structural (no persistence beyond the plain-text file the user already manages).

## `CtxliteignoreFile`

Represents the parsed contents of a project's `.ctxliteignore`, if present.

| Field | Type | Notes |
|---|---|---|
| `exists` | `boolean` | `false` when the file isn't present at the project root — the common case (spec FR-004) |
| `patterns` | `IgnorePattern[]` | Empty array when `exists` is `false`, or when the file exists but every line was a comment/blank |

Not a class/exported type on its own — `loadIgnorePatterns(cwd)` returns `IgnorePattern[]` directly (empty array covers both "no file" and "no valid patterns"), since nothing downstream needs to distinguish those two cases.

## `IgnorePattern`

One compiled pattern, derived from one non-comment, non-blank line of `.ctxliteignore`.

| Field | Type | Notes |
|---|---|---|
| `source` | `string` | The original line, trimmed — kept for error messages/debugging, not otherwise used |
| `regex` | `RegExp` | Compiled from `source` per the limited glob subset in research.md Decision 1 |
| `directoryOnly` | `boolean` | `true` when `source` ended in `/` — matches the directory and everything under it, not a same-named file |

**Validation rules** (FR-005): a line that fails to compile to a valid `RegExp` (shouldn't normally happen given the limited, always-valid-output subset, but defensively guarded) is skipped — it never throws, and never prevents other lines in the same file from being parsed.

**Relationships**: `IgnorePattern[]` is consumed by two independent call sites — `optimizeReadPath` (checks a single path against all patterns, in addition to `BLOCKED_READ_PATTERNS`) and each `trim_context` tool implementation (checks each candidate file's path before scoring). Neither call site needs to know about `CtxliteignoreFile` as a concept — both just receive `IgnorePattern[]` from `loadIgnorePatterns(cwd)`.
