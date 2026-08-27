# Contract: Precall block-and-redirect for full-content reads

**Surface**: `packages/core/src/tool-precall.ts` → `optimizeToolArgs()` /
`optimizeReadPath()`, consumed by `packages/opencode/src/tool-precall-hook.ts`.
This is the internal contract between `@ctxlite/core` and the OpenCode plugin
adapter — not a network/HTTP API, but it is the seam other code (and future
hosts) integrate against, so it is documented like one.

## Input

Same `PrecallResult`-producing call shape already used today:

```ts
optimizeToolArgs(tool: string, args: Record<string, unknown>, cwd?: string): PrecallResult
```

New behavior applies when `tool === "read"` and the resolved path:
- is **not** already blocked by an existing `BLOCKED_READ_PATTERNS` /
  `.ctxliteignore` rule, **and**
- resolves to a file at or above the shared `smart_read` eligibility
  threshold (research.md §3), **and**
- the current session's precall state (`precall-state.ts`) shows no
  edit/write intent on the same path within the recent window
  (research.md §2).

## Output (new block case)

```ts
{
  args: { path },
  modified: false,
  blocked: true,
  blockReason: string,   // MUST name the path and the smart_read alternative by tool name
  estimatedTokensSaved: number,
}
```

`blockReason` format contract (agent-facing, must be directly actionable):

```
Blocked full read of "<path>": this file is large enough that smart_read
(structure-only) is the ctxlite-preferred way to inspect it. Retry with
smart_read on the same path. If you specifically need exact content to make
an edit, use `edit`/`write` on this path first — that unblocks a full read.
```

## Output (allowed cases — unchanged shape, new reasons why blocked stays false)

- File below threshold (FR-007): `blocked: false`, no message.
- Edit intent detected (FR-006): `blocked: false`, no message.
- Existing low-signal-path rules still take precedence and behave exactly as
  today (this contract only adds a new condition under which `blocked` can
  become `true`; it does not change any existing `true` case).

## Consumer contract (OpenCode plugin)

`packages/opencode/src/tool-precall-hook.ts` MUST, on `result.blocked === true`:
1. Set `output.result` to `` `[ctxlite] ${result.blockReason}` `` (existing
   pattern, unchanged).
2. Call `logOptimizationSavings` with `source: "precall"` and the row shape
   already used for the low-signal-path block case (existing pattern,
   unchanged) — this is what makes the new rule show up in stats/dashboard
   data per User Story 1.

## Backward compatibility

- `PrecallResult`'s shape is unchanged — no new fields required by consumers.
- Hosts other than OpenCode (Cursor, Claude Code) are not required to call
  this new code path differently than they call the existing one; per spec
  scope, they are not wired to trigger the new rule in this feature, but
  nothing in this contract prevents them from adopting it later without a
  breaking change.
