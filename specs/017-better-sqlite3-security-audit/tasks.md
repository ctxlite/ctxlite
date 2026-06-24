# Tasks: better-sqlite3 Security Findings Audit

**Input**: Design documents from `/specs/017-better-sqlite3-security-audit/`

**Prerequisites**: plan.md ✅, spec.md ✅ (no research.md/data-model.md/contracts/quickstart.md — plan.md explains why none apply to a documentation-only investigation)

**Tests**: Not applicable. Constitution Principle II mandates a test for every task that changes behavior in `packages/*/src` — this feature changes zero files under `packages/*/src` (confirmed in plan.md's Technical Context and Constitution Check). There is no behavior to write a test against.

**Organization**: Tasks are grouped by user story, per spec.md's priorities (P1, P2).

## Status

Both user stories' actual deliverable — the sourced conclusion in spec.md's Findings section — was produced during `/speckit-specify`, before this plan/tasks pass existed (the user explicitly asked for research first, spec second). What remains below is genuinely outstanding work, not a record of what's already done.

## Phase 1: Setup

Not applicable — no project initialization, no new dependencies, no new structure (plan.md's Project Structure section).

## Phase 2: Foundational

Not applicable — nothing blocks the user stories below; each was already independently satisfied by the research already in spec.md.

## Phase 3: User Story 1 - Maintainer confirms a flagged dependency isn't actually compromised (Priority: P1) 🎯 MVP

**Goal**: A maintainer can close the better-sqlite3 portion of the Socket.dev alert with sourced evidence.

**Independent Test**: Read `specs/017-better-sqlite3-security-audit/spec.md`'s Findings section and cross-check the two cited Snyk URLs; no code or environment setup required.

- [x] T001 [US1] Research and record findings in `specs/017-better-sqlite3-security-audit/spec.md` (Findings section) — completed during `/speckit-specify`.
- [x] T002 [US1] Update task #32's tracked description to mark the better-sqlite3 portion resolved, citing this spec — completed during `/speckit-specify`.

**Checkpoint**: User Story 1 is satisfied — no further action needed for this story.

## Phase 4: User Story 2 - Future readers understand why ctxlite's own PRAGMA usage is safe (Priority: P2)

**Goal**: A future contributor encountering the same Socket.dev/AI-anomaly finding (or a new PRAGMA call) finds the existing answer instead of re-deriving it.

**Independent Test**: `grep -rn "pragma\|PRAGMA" packages/core/src/*.ts` and confirm every call site is a literal string — already true today (spec.md Finding #4), but not yet *discoverable* from the places a future reader would actually look.

- [x] T003 [US2] Add a one-line cross-reference to `specs/017-better-sqlite3-security-audit/spec.md`'s conclusion in `.claude/skills/ctxlite-internals/SKILL.md`'s "`core/install/` — per-host config paths" section's sibling content — specifically, add a short subsection (or extend the existing SQLite-schema paragraph) noting: PRAGMA calls in `sqlite-adapter.ts`/`sqlite-bun.ts` are hardcoded literals by design, any new PRAGMA call taking a variable argument must answer the injection-risk question explicitly (this is spec FR-006's forward-looking constraint, restated where a contributor will actually see it before writing such code).
- [x] T004 [US2] Copy the same addition verbatim to `.cursor/skills/ctxlite-internals/SKILL.md` and `.opencode/skills/ctxlite-internals/SKILL.md`, per this project's established convention of keeping the three copies byte-identical (see how the skill was first installed).

**Checkpoint**: Both stories satisfied once T003/T004 are done.

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T005 [P] Run `npm test && npm run typecheck` to confirm T003/T004 (pure Markdown edits) didn't break anything — expected to be a no-op confirmation, included because Constitution Principle II/AGENTS.md's checklist applies regardless of how small the change looks.

---

## Dependencies & Execution Order

- T001, T002 (US1): already complete, no action.
- T003, T004 (US2): sequential by necessity (T004 copies T003's exact final text) — not parallelizable despite touching different files, since T004's content depends on T003's output being finalized first.
- T005: depends on T003 and T004 being done.

## Parallel Opportunities

None — this feature's remaining scope (T003-T005) is small and sequential by nature (write once, copy twice, then verify). There is no multi-developer parallelization opportunity worth structuring for a 3-task remainder.

## Implementation Strategy

### MVP

User Story 1 (P1) is already the MVP and is already done (T001, T002). If you stop here, the feature has already delivered its primary value (closing the open security alert with evidence). User Story 2 (T003-T005) is a documentation hardening pass on top — valuable, but not blocking.

## Notes

- Commit T003+T004 together (they must land in the same commit to keep the three `ctxlite-internals` copies in sync — see the constitution's note on `AGENTS.md`/`CLAUDE.md`/skill drift).
- No `/speckit-implement` automation is expected to do anything beyond T003-T005 here; there's no code to scaffold.
