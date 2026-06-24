# `.ctxliteignore` File Format (user-facing contract)

This is the interface contract for this feature — the file format itself, since that's what a maintainer actually interacts with. There's no new API/CLI flag; the contract is "what you can write in this file, and what happens."

## Location

`.ctxliteignore` at the project root (same directory as `package.json`/`.git`). Optional — its absence is the default, unchanged-behavior case.

## Syntax

One pattern per line.

| Line form | Meaning |
|---|---|
| (blank) | Ignored |
| `# comment` | Ignored — must start with `#` as the first non-whitespace character |
| `path/segment/` | Matches that directory and everything under it (trailing `/` required for directory-only intent) |
| `*.ext` | Matches any file ending in `.ext`, anywhere in the project |
| `dir/**/file.ts` | `**` matches any number of path segments, including zero |
| anything else not matching the above and not compiling to a valid pattern | Skipped silently (never an error, never disables the rest of the file) |

**Not supported** (by deliberate scope decision, see `research.md` Decision 1): negation (`!pattern`), `.gitignore`-style relative-vs-anchored nuances, character classes (`[abc]`), brace expansion (`{a,b}`).

## Effect

1. **Reads/Glob calls**: a path matching any `.ctxliteignore` pattern is blocked the same way a built-in pattern (`node_modules/`, etc.) already is — the agent gets a block message, the savings are logged as `source: "precall"`, same as today.
2. **`trim_context` calls**: a candidate file matching any pattern is dropped from the result before BM25 scoring runs, regardless of how relevant it would otherwise score.

## Example

```
# Generated/vendor directories specific to this project
vendor/
migrations/generated/

# Specific file patterns
*.generated.ts
**/*.snap
```

## Non-goals

This file does not affect `git`, ESLint, or any other tool's own ignore mechanism — it is read only by ctxlite, independently of `.gitignore`. A maintainer who wants the same paths excluded from git tracking still needs a separate `.gitignore` entry; this is not a `.gitignore` replacement or alias.
