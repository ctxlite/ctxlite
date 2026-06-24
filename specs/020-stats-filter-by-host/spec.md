# Feature Specification: Filter `ctxlite stats` by Host

**Feature Branch**: `020-stats-filter-by-host`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "i would like to have the posibility to see the stats overall by tool and by session by tool --by-session opencode or claude-code or cursor and stats opencode etc and just status will show all stats as of now"

## Investigation Findings (pre-spec verification, not a placeholder)

Checked against the actual current code (not assumed) before writing this spec:

1. **`StatsStore.summary(since)`** (`packages/core/src/stats.ts`) has no host parameter at all — it always aggregates across every host combined. There is no existing way to get "overall stats for just OpenCode" today.
2. **`StatsStore.sessionBreakdown(since)`** likewise has no host parameter — `ctxlite stats --by-session` always lists every host's sessions together (host is shown as a column/grouping key, but can't be used as a filter).
3. **`StatsStore.summaryForSession(host, sessionId)`** requires both a host AND a specific session ID — it cannot show "all of OpenCode's sessions combined," only one exact session.
4. **The CLI's `parseArgs`** (`packages/cli/src/stats-command.ts`) silently drops a positional token after `stats` that isn't a recognized flag — running `ctxlite stats opencode --by-session` today behaves identically to `ctxlite stats --by-session`, with `opencode` silently discarded (not an error, not a filter, just ignored). This confirms the user's requested syntax doesn't work today, for a parsing reason rather than a "feature exists but is hidden" reason.
5. **The real distinct `host` values actually written to the database** (verified by grepping every `host: "..."` call site) are `opencode`, `claude-code`, `cursor`, and `mcp` — four, not three. The fourth, `mcp`, covers every MCP tool call (`trim_context`, `smart_read`, `get_stats`) regardless of which client made it (Claude Code, Cursor, or Claude Desktop all log as `mcp` when going through the MCP server, since the MCP protocol gives no host-identifying field). This means "claude-code" and "cursor" as host filters only ever match each host's *native hook bridge* activity (precall rewrites/blocks, output compression) — not that host's MCP-based tool calls, which fall under `mcp` instead. This is a real, pre-existing distinction worth surfacing rather than silently merging.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter the overall summary by host (Priority: P1)

A user runs `ctxlite stats opencode` (or `claude-code`, `cursor`, `mcp`) to see the aggregate token-savings summary for just that one host's activity, instead of every host combined.

**Why this priority**: This is the most directly requested capability ("stats opencode etc") and the simplest to deliver — one additional filter on the existing single-summary query path.

**Independent Test**: With logged rows from multiple hosts in the database, run `ctxlite stats opencode`; confirm the reported totals match only the `opencode`-tagged rows (verifiable by comparing against a direct query/the existing per-session numbers for that host).

**Acceptance Scenarios**:

1. **Given** a database with rows logged under `opencode`, `claude-code`, and `cursor`, **When** the user runs `ctxlite stats opencode`, **Then** the displayed totals (requests, tokens saved, cost saved, per-category breakdown) reflect only `opencode` rows.
2. **Given** the same database, **When** the user runs `ctxlite stats` with no host argument, **Then** behavior is completely unchanged from today — all hosts combined (this feature is additive, never required).
3. **Given** a host name that doesn't match any known value (typo, e.g. `opncode`), **When** the user runs `ctxlite stats opncode`, **Then** the command reports a clear "no data" or "unknown host" outcome rather than silently falling back to all-hosts data or crashing.

---

### User Story 2 - Filter the by-session breakdown by host (Priority: P1)

A user runs `ctxlite stats --by-session opencode` to see the existing per-session breakdown, but narrowed to only that host's sessions.

**Why this priority**: Equally explicit in the request ("by session by tool --by-session opencode") and equally validated as missing — same priority as User Story 1, just the other existing view.

**Independent Test**: With sessions logged under multiple hosts, run `ctxlite stats --by-session opencode`; confirm only `opencode` sessions appear in the output, in the same per-session format `--by-session` already produces today.

**Acceptance Scenarios**:

1. **Given** sessions logged under `opencode` and `cursor`, **When** the user runs `ctxlite stats --by-session opencode`, **Then** only `opencode` sessions are listed, in the existing per-session detailed format (unchanged formatting, just a narrower row set).
2. **Given** the same database, **When** the user runs `ctxlite stats --by-session` with no host argument, **Then** behavior is unchanged from today — every host's sessions listed together.
3. **Given** the `--export json` flag is also passed, **When** a host filter is applied, **Then** the JSON output contains only that host's rows — the filter applies identically across both `text` and `json` export formats.

### Edge Cases

- What happens when a host filter matches zero rows (e.g. a real host value, but nothing logged yet for it)? → Same "No requests recorded yet" message the existing zero-data case already shows, not an error.
- What happens with the host argument's position relative to other flags (`ctxlite stats opencode --last 7d` vs `ctxlite stats --last 7d opencode`)? → Both must work — the host token is a positional argument independent of flag order, consistent with how `--last`/`--by-session`/etc. already don't care about their own relative order.
- What happens with host name casing (`OpenCode` vs `opencode`)? → Matched case-insensitively against the four known values, then normalized to the stored lowercase form, so a user typing the display name doesn't get silently zero results from a casing mismatch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept an optional positional host argument after `stats` (e.g. `ctxlite stats opencode`), filtering the single-summary view to that host only.
- **FR-002**: System MUST accept the same optional positional host argument in combination with `--by-session` (e.g. `ctxlite stats --by-session opencode`, in either token order), filtering the by-session breakdown to that host only.
- **FR-003**: The recognized host values MUST be exactly the four real values currently written to the database: `opencode`, `claude-code`, `cursor`, `mcp` — matched case-insensitively.
- **FR-004**: Omitting the host argument MUST produce byte-for-byte identical output to today's behavior (all hosts combined) — zero behavior change for the existing, unfiltered invocation form.
- **FR-005**: An unrecognized host token MUST NOT be silently ignored (today's behavior) — it MUST either filter to zero results with a clear message, or be rejected with a clear error naming the valid host values, rather than silently behaving as if no filter were given.
- **FR-006**: The host filter MUST apply identically to both `--export text` (default) and `--export json` output.
- **FR-007 (explicitly out of scope)**: This spec does NOT add a new host value, does NOT change what gets logged as `mcp` vs a per-client identity (that would require the MCP protocol to expose a client identity, which it doesn't today — a real protocol limitation, not a gap this spec can close), and does NOT add filtering by any dimension other than host (e.g. by date range beyond the existing `--last`, or by individual tool/category) to this change.

### Key Entities

N/A — no new data entities; this filters existing query methods (`summary`, `sessionBreakdown`) by an existing, already-stored column (`host`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can get host-scoped overall stats and host-scoped session-breakdown stats using the exact syntax they requested (`ctxlite stats opencode`, `ctxlite stats --by-session opencode`), for all four real host values.
- **SC-002**: Every existing invocation form (`ctxlite stats`, `ctxlite stats --by-session`, `ctxlite stats --last 7d`, etc., with no host argument) produces unchanged output — confirmed by the full existing `stats-command.test.ts` suite continuing to pass without modification to any pre-existing test case.
- **SC-003**: A mistyped host name never silently produces all-hosts data — it's always either a clear empty-result message or a clear error, distinguishable from "no host filter was applied."

## Assumptions

- The host argument is positional (no `--host` flag) because that's the exact syntax the user requested (`stats opencode`, not `stats --host opencode`) — both are reasonable, but positional matches the request directly and is shorter to type, consistent with `stats`'s existing minimal-flag CLI style.
- `mcp` is included as a fourth recognized value (not just the three the user named) because it's a real, already-logged host value — omitting it would make the feature incomplete for a quarter of the real data, and a user who only knew three host names would have no way to discover the fourth without reading source code.
- No new dependency needed — this adds one optional SQL `AND host = ?` clause to two existing, parameterized queries, plus argument-parsing changes in the existing `parseArgs` function.
