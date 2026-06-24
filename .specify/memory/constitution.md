<!--
Sync Impact Report
Version change: (template) → 1.0.0
Modified principles: n/a (initial ratification — all principles newly defined)
Added sections: Core Principles (I–V), Additional Constraints, Development Workflow & Review Process, Governance
Removed sections: none
Templates requiring updates:
  ✅ .specify/templates/tasks-template.md — "Tests are OPTIONAL" line contradicted Principle II; changed to mandatory
  ✅ .specify/templates/plan-template.md — Constitution Check gate already generic (reads this file at plan time); no edit needed
  ✅ .specify/templates/spec-template.md — reviewed, no constitution-specific references to update
  ✅ AGENTS.md / CLAUDE.md — already point to this file's governing skills; no edit needed
Follow-up TODOs: none
-->

# ctxlite Constitution

## Core Principles

### I. Spec-Driven Implementation (NON-NEGOTIABLE)

Any change beyond a trivial one-line fix or pure-docs edit MUST go through the
Spec Kit workflow in order: `/speckit-specify` → `/speckit-plan` →
`/speckit-tasks` → `/speckit-implement`. "Trivial" means: no behavior change,
no new file, no test impact (typo fixes, comment wording, dependency version
bumps already decided elsewhere). When in doubt, treat it as non-trivial.

Rationale: this repository has shipped multiple real regressions from
ad-hoc, unplanned edits to fragile areas (`tool-precall.ts`'s regex/segment
logic, per-host install paths, the SQLite migration pattern — see the
`ctxlite-internals` skill for the specific incidents). A written spec and
plan, reviewed before implementation starts, is what catches a wrong
assumption before it ships, not after.

### II. Test-First, Zero Skipped Tests (NON-NEGOTIABLE)

Every task that adds or changes behavior in `packages/*/src` MUST have a
test covering it, written and run *before* the task is marked complete.
Tests are never optional in a Spec Kit task list for this repository —
override any template language that suggests otherwise.

- `it.skip`, `describe.skip`, `.todo`, or any equivalent is not permitted to
  merge without a tracked follow-up (a task or memory entry with a concrete
  reason and a condition for re-enabling it) — an indefinitely silent skip
  is equivalent to deleting the test.
- Statement/line coverage MUST NOT regress below the level established in
  `vitest.config.ts`'s tracked baseline (90%+ as of this ratification).
  Mocks must exercise real failure paths (a thrown error, a corrupt file, a
  missing dependency), not just the happy path — a mock that only ever
  returns success is not a real test of error handling.
- `npm run typecheck && npm test` MUST pass before a task is considered
  done. `npm run lint` too, for anything touching `packages/*/src`.

Rationale: the project's own test suite went from 73% to 95%+ coverage in
one session specifically because gaps in it had let real bugs through
undetected. Treat that as the floor to defend, not a one-time cleanup.

### III. Mandatory Review Gate Before Merge (NON-NEGOTIABLE)

No implementation is considered finished until both of the following have
run and their findings have been addressed or explicitly accepted with a
stated reason:

1. `/speckit-analyze` — cross-artifact consistency between the spec, plan,
   tasks, and the actual diff.
2. A code-quality/correctness review (the `/code-review` workflow, or an
   equivalent independent pass when that tool isn't available) — covering
   correctness bugs, not just style.

A change that skips this gate may be reverted regardless of whether it
otherwise works, since "it works" is not the same claim as "it was
reviewed."

### IV. Core-First Architecture

Business logic lives only in `@ctxlite/core`. `@ctxlite/opencode`,
`@ctxlite/mcp`, and `@ctxlite/cli` are thin adapters that translate one
host's plugin/hook API into calls against `core` — they MUST NOT duplicate
logic that already exists in `core`, and MUST NOT contain logic that isn't
specific to their one host. No circular dependencies between packages.

### V. Security and Secrets Discipline

Never log or persist API keys, session tokens, Authorization headers, or
request/response bodies that may contain user secrets. `~/.ctxlite/`
contents are user-only permissions. All external input (tool args, file
content) is validated at the boundary (zod schemas, explicit size limits)
before use. `npm audit --audit-level=high` MUST pass (run via
`scripts/ci.sh` / `scripts/publish-npm.sh`) before any release.

## Additional Constraints

- TypeScript/Go style, security specifics, and monorepo layout rules in
  `.cursor/rules/*.mdc` apply regardless of which coding agent is in use —
  this constitution governs workflow and gating; those files govern code
  shape.
- All documentation, code comments, and commit messages are in English
  (per the `english-docs` skill).
- All TypeScript packages share one version, defined once in root
  `package.json`'s `config.version`, propagated via `npm run sync-version`
  — never hand-edit a package's own `version` field.
- `AGENTS.md` / `CLAUDE.md` and the `ctxlite-internals` skill are the
  onboarding path for any agent working in this repo; keep them in sync
  with this constitution rather than letting either drift independently.

## Development Workflow & Review Process

1. **Specify** (`/speckit-specify`): capture the feature/fix as a spec
   before writing any code. Ambiguities get resolved here or via
   `/speckit-clarify`, not by guessing during implementation.
2. **Plan** (`/speckit-plan`): the Constitution Check gate in the plan
   template reads this file — a plan that can't satisfy Principles I–V
   must either be redesigned or carry an explicit, justified exception in
   the plan's Complexity Tracking section.
3. **Tasks** (`/speckit-tasks`): every task list for this repository
   includes test tasks per Principle II; the upstream template's "tests
   are optional" default is overridden here.
4. **Implement** (`/speckit-implement`): execute tasks in order; each task
   ends with its own test passing, not just at the end of the whole batch.
5. **Review** (Principle III): `/speckit-analyze` plus a correctness
   review, before considering the work mergeable.
6. **Converge** (`/speckit-converge`), periodically: reconcile the
   constitution and specs against what the codebase actually does, and
   file the gap as tracked tasks rather than letting drift accumulate
   silently.

## Governance

This constitution supersedes ad-hoc practice for anything it covers. The
`.cursor/rules/*.mdc` files and `ctxlite-internals` skill are subordinate
references for *how* to satisfy these principles, not alternatives to them.

**Amendments**: run `/speckit-constitution` to propose a change. A bump is:
MAJOR for removing or redefining a principle in a backward-incompatible
way, MINOR for adding a principle or materially expanding one, PATCH for
wording/clarification only. Every amendment updates the Sync Impact Report
at the top of this file and re-checks `plan-template.md`,
`spec-template.md`, and `tasks-template.md` for now-stale assumptions.

**Compliance**: the review gate (Principle III) includes verifying the
change against this constitution, not just against the spec it was
implementing. A reviewer who finds a constitution violation blocks the
merge — "the spec didn't mention it" does not override a NON-NEGOTIABLE
principle.

**Version**: 1.0.0 | **Ratified**: 2026-06-24 | **Last Amended**: 2026-06-24
