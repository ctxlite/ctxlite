# Implementation Plan: better-sqlite3 Security Findings Audit

**Branch**: `main` (no dedicated feature branch — see Complexity Tracking) | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-better-sqlite3-security-audit/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Close out the better-sqlite3 portion of a Socket.dev security alert against `@ctxlite/mcp`'s published dependency tree ("Obfuscated code" + an AI-generated PRAGMA-injection write-up). The spec's research (already completed via web search, since context7 MCP wasn't available) concluded both findings are accounted for and require no version bump or code change: better-sqlite3 isn't part of the June 2026 node-gyp supply-chain compromise, has zero listed vulnerabilities at the installed version, and ctxlite's own PRAGMA usage is three hardcoded literals never reachable by external input. This plan's only real output is the evidence trail itself (already in spec.md's Findings section) plus closing task #32's better-sqlite3 scope — there is no source code to design or build.

## Technical Context

**Language/Version**: N/A — this is an investigation/documentation task, not a code change. The audited dependency (`better-sqlite3 ^12.11.0`, installed `12.11.1`) runs under Node.js 18+ as already established by the monorepo.

**Primary Dependencies**: `better-sqlite3` (audited), `@ctxlite/core` (the package that depends on it)

**Storage**: N/A — no schema or data model change. (The audited dependency itself *is* the SQLite driver behind `~/.ctxlite/stats.db`, but this feature doesn't touch that schema.)

**Testing**: N/A — no new test is needed; the existing `packages/core/src/sqlite-adapter.test.ts` already covers the three PRAGMA call sites this audit examined (added in the earlier coverage-raising work), and re-confirms they're literal strings every time it runs.

**Target Platform**: N/A (documentation/evidence artifact only)

**Project Type**: Documentation/audit — closes a tracked task (#32) with a written, sourced conclusion

**Performance Goals**: N/A

**Constraints**: The conclusion is time-scoped to the investigation date (2026-06-24) and the installed version (12.11.1) — it is not a standing guarantee against future advisories (stated explicitly in spec.md's Edge Cases).

**Scale/Scope**: One dependency (`better-sqlite3`), two Socket.dev findings ("Obfuscated code", and the AI-anomaly PRAGMA write-up). The other three findings tracked under task #32 (Deprecated, No License Found, Potential vulnerability — all in `@modelcontextprotocol/sdk`'s tree) are explicitly out of scope for this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Benefit** — What does this change achieve, measurably or directly
observably, and for whom?
A maintainer can close the better-sqlite3 portion of an open security alert with a sourced, checkable answer in under a minute (spec.md SC-001/SC-002) instead of an unresolved "Socket flagged something, not sure if it matters." Concretely: task #32 narrows from 4 unidentified findings to 3, with the 4th resolved and documented.

**Risk** — What's the specific, most-likely-to-break thing? Which existing
behavior/test/host integration is in the blast radius?
None — this is a documentation-only change. No source file under `packages/*/src` is modified, no dependency version changes, no test changes. The only way this could be "wrong" is if the research conclusion itself is wrong (e.g., the Snyk pages were stale or misread); that risk is mitigated by citing the exact pages and quoting their content in spec.md's Findings section, so a reader can re-verify rather than trust the conclusion blindly.

**Validation** — How was/will this be verified? Name the actual test(s)
or the actual live host check performed (not just "typecheck and test
pass").
Verified by: (1) reading `node_modules/better-sqlite3/lib/methods/pragma.js` directly to confirm the exact PRAGMA string-templating pattern Socket's AI-anomaly write-up describes; (2) reading `packages/core/src/sqlite-adapter.ts` and `sqlite-bun.ts` directly to confirm all three of ctxlite's own PRAGMA call sites are literal strings (`grep -rn "pragma\|PRAGMA" packages/core/src/*.ts`); (3) fetching Snyk's package-specific advisory page for `better-sqlite3` (zero vulnerabilities listed) and Snyk's dedicated Node-gyp Supply Chain Compromise advisory page (57-package confirmed list, `better-sqlite3` absent) via WebFetch. No host-integration behavior changed, so no live `cursor-agent`/`opencode run` check applies here — this is the correct "N/A" case Principle II/VI anticipate for a non-behavior-changing investigation.

**Cross-tool availability** — Does this apply uniformly across every host
ctxlite supports (OpenCode, Claude Code, Cursor, Claude Desktop where
relevant)? If not, is the asymmetry a documented platform constraint or an
oversight to track as a follow-up task?
N/A by nature of the change — `better-sqlite3` is a Node-only dependency used identically by `@ctxlite/cli` and `@ctxlite/mcp` (which is what every host besides OpenCode's Bun runtime relies on for stats storage); OpenCode itself uses the separate `bun:sqlite` adapter (`sqlite-bun.ts`), not `better-sqlite3`, so it was never in scope for this specific finding. This asymmetry is the existing, already-documented dual-backend design (`docs/architecture.md`'s Stats Storage section), not a gap introduced or left open by this feature.

*Gate result: PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/017-better-sqlite3-security-audit/
├── plan.md              # This file
├── spec.md              # Already written, includes the Findings section (the actual deliverable)
├── checklists/
│   └── requirements.md  # Already written, all items pass
└── tasks.md             # Phase 2 output (/speckit-tasks command — minimal, see below)
```

No `research.md`, `data-model.md`, `contracts/`, or `quickstart.md` are generated for this feature — there are no unresolved NEEDS CLARIFICATION items to research (the spec was written *after* the research, per the user's explicit request), no data model (no schema change), no interface contract (no new API surface), and no runnable quickstart (there's nothing to run — the validation is "read the cited sources," already inline in spec.md).

### Source Code (repository root)

No source code changes. This feature does not touch `packages/*/src`.

**Structure Decision**: No new structure — this feature produces only the `specs/017-better-sqlite3-security-audit/` documentation tree already shown above, plus an update to task #32's tracked description (already applied). `/speckit-tasks` for this feature should generate a very short list (record findings ✅ already done, update task #32 ✅ already done, optionally: link this spec from `ctxlite-internals` or `docs/architecture.md` if a future reader would benefit) rather than the usual multi-phase user-story breakdown.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.

(Note on the missing feature branch: Principle I requires the spec→plan→tasks→implement workflow for non-trivial changes, which this satisfies; it does not separately mandate a dedicated git branch per feature, and no `before_specify`/branch-creation hook is registered in `.specify/extensions.yml` for this project. Working directly on `main` for a documentation-only, zero-source-diff feature is consistent with how the rest of this session's work has been committed.)
