<!--
Sync Impact Report
Version change: 1.3.0 → 1.4.0
Bump rationale: MINOR — new governing guidance added: local git-hook
  enforcement of typecheck/lint/test is now a constitutional requirement,
  not left to CI alone. Triggered by a real incident: an
  @typescript-eslint/no-unsafe-assignment error in
  packages/core/src/install/merge.ts (Array.isArray narrowing to any[],
  then spreading it — fixed by casting to unknown[] before the spread)
  reached GitHub Actions undetected because nothing ran lint locally
  first.
Modified principles: none
Added sections: a new Additional Constraints bullet — "Local enforcement,
  not CI-only enforcement" — requiring scripts/git-hooks/ to exist and
  stay wired via package.json's prepare script, and treating its removal
  without an equivalent replacement as a constitution violation.
Removed sections: none
Templates requiring updates:
  ✅ packages/core/src/install/merge.ts — fixed the actual lint error
     (cast to `unknown[]` before each unsafe spread)
  ✅ scripts/git-hooks/pre-commit (new) — lint + typecheck
  ✅ scripts/git-hooks/pre-push (new) — full scripts/ci.sh
  ✅ package.json — added "prepare": "git config core.hooksPath
     scripts/git-hooks"
  ✅ docs/contributing.md — documented the hook wiring and why it exists,
     right after the `npm install` setup step
  ✅ AGENTS.md — added a "don't bypass with --no-verify" constraint
     alongside the existing typecheck/test/lint/coverage checklist
  ✅ .specify/templates/plan-template.md / tasks-template.md /
     spec-template.md — reviewed, no edit needed (this constraint governs
     repo tooling, not feature-specific planning fields)
Follow-up TODOs: none

Sync Impact Report (previous)
Version change: 1.2.0 → 1.3.0
Bump rationale: MINOR — new governing guidance added: `specs/` is now
  committed, tracked history, superseding an earlier "local only, not
  committed" convention documented in docs/contributing.md. Triggered by
  discovering that .gitignore's `specs/` entry was silently blocking the
  Spec Kit-managed `017-better-sqlite3-security-audit/` feature directory
  from ever being committed. The 16 pre-existing specs (SPEC-001 through
  SPEC-016, plus an addendum) were reviewed for sensitive content (none
  found — generic design docs with only dummy credential examples like
  "sk-test") and committed rather than migrated to a _legacy/ folder.
Modified principles: none
Added sections: a new Additional Constraints bullet — "specs/ is
  committed, tracked history" — requiring a sensitive-content scan before
  committing any spec.
Removed sections: none
Templates requiring updates:
  ✅ .gitignore — removed the blanket `specs/` entry (kept
     `.specify/integrations/.cache/` and `.specify/feature.json`, which are
     genuinely local-only working state, not specs)
  ✅ docs/contributing.md — "Specs live in specs/ (local only, not
     committed)" rewritten to state the new committed-history policy
  ✅ AGENTS.md / CLAUDE.md / ctxlite-internals skill — reviewed, none
     repeated the old "local only" claim, no edit needed
Follow-up TODOs: none

Sync Impact Report (previous)
Version change: 1.1.0 → 1.2.0
Bump rationale: MINOR — two changes bundled in one amendment. (1) Principle
  II's coverage bullet tightened from a "don't regress from baseline"
  reference into a literal, hard 90% floor — on its own a PATCH-level
  clarification. (2) A new Release Discipline constraint was added under
  Additional Constraints, triggered by a real failure in this same
  session (`npm publish` rejected re-publishing v0.1.25 because no version
  bump had happened since it was last published) — adding new governing
  guidance is MINOR. Bundled, the amendment is MINOR.
Modified principles: II. Test-First, Zero Skipped Tests — coverage bullet
  rewritten from "must not regress below the tracked baseline (90%+)" to an
  explicit "MUST NOT be below 90%, project-wide, per package" floor, naming
  `npm run test:coverage` as the check and requiring `vitest.config.ts`
  scope exclusions to carry an inline justification comment.
Added sections: Release Discipline (under Additional Constraints) —
  version-bump-before-publish requirement, tied to the real
  `scripts/publish-npm.sh --publish` failure above.
Removed sections: none
Templates requiring updates:
  ✅ AGENTS.md — added the `npm run test:coverage` check alongside the
     existing typecheck/test/lint checklist
  ✅ docs/contributing.md — added an explicit "confirm the bump against
     npm's published version first" note in the manual-publish section,
     pointing back to this constraint
  ✅ .specify/templates/plan-template.md — reviewed; the existing four
     Principle VI fields already cover validation specifics per change,
     no edit needed for a project-wide numeric floor or the release rule
  ✅ .specify/templates/tasks-template.md — reviewed; already mandates
     tests generally, the 90% floor is a project-wide CI/local gate rather
     than a per-task template field, no edit needed
  ✅ .specify/templates/spec-template.md — reviewed, no change needed
Follow-up TODOs: none

Sync Impact Report (previous)
Version change: 1.0.0 → 1.1.0
Modified principles: n/a (existing I–V unchanged)
Added sections: Principle VI (Implementation Heuristic Gate)
Removed sections: none
Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check section was a generic placeholder; replaced with the four Principle VI questions as explicit, fillable fields so the gate can't be skipped by omission
  ✅ .specify/templates/tasks-template.md — already mandates tests (v1.0.0 change); no further edit needed
  ✅ .specify/templates/spec-template.md — reviewed, no constitution-specific references to update
  ✅ AGENTS.md / CLAUDE.md — already point to this file as the binding process; no edit needed
Follow-up TODOs: none

Sync Impact Report (initial)
Version change: (template) → 1.0.0
Modified principles: n/a (initial ratification — all principles newly defined)
Added sections: Core Principles (I–V), Additional Constraints, Development Workflow & Review Process, Governance
Removed sections: none
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
- **Statement/line coverage MUST NOT be below 90%, project-wide, for any
  package in `packages/*`. This is a hard numeric floor, not a soft
  "don't regress from whatever the baseline happens to be" — 90% is the
  number, checked the same way every time: `npm run test:coverage`
  (`vitest run --coverage`) against the scope defined in
  `vitest.config.ts`.** A change that drops any package below 90% fails
  this gate and MUST add tests before it can be considered done — it is
  not acceptable to ship the drop and "add tests later." Files excluded
  from the scope in `vitest.config.ts` (currently: the legacy Go npm
  distribution, and process entrypoints validated by spawning the built
  binary instead) must stay justified by an inline comment in that file,
  not silently widened to dodge the floor.
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

### VI. Implementation Heuristic Gate (NON-NEGOTIABLE)

Before `/speckit-tasks` generates a task list, and again before
`/speckit-implement` starts executing it, the plan MUST answer these four
questions explicitly, with concrete specifics for *this* change — a vague
or generic answer ("improves performance", "tested it") fails the gate as
surely as a missing one:

1. **Benefit** — What does this change actually achieve, for whom? State
   it as a measurable or directly observable outcome (tokens saved, a bug
   no longer reproducible, a host that now works that didn't), not as an
   intention.
2. **Risk** — What is the specific, most-likely-to-break thing? Which
   existing behavior, test, or host integration is in the blast radius?
   "Nothing, it's additive" is only a valid answer when the change truly
   adds a new code path with zero shared lines with existing ones —
   justify that claim if you make it.
3. **Validation** — How was (or will) this be verified? Name the actual
   test(s), or the actual live check performed (e.g. a real `cursor-agent
   -p`/`opencode run` session, not just a unit test mocking the host).
   `npm run typecheck && npm test` passing is necessary but is not by
   itself a sufficient answer for a change to host-integration behavior —
   that needs a real or realistic-mock host interaction (see Principle
   II's note on mocks exercising real failure paths).
4. **Cross-tool availability** — Does this change apply uniformly across
   every host ctxlite supports today (OpenCode, Claude Code, Cursor,
   Claude Desktop where relevant)? If not, is the asymmetry a real
   platform constraint (e.g. Cursor's `postToolUse` cannot rewrite
   built-in tool output) that's documented where a future reader would
   find it, or is it an oversight that should become a follow-up task
   instead of being shipped silently?

A plan that cannot answer all four concretely is not ready for
`/speckit-tasks` — resolve the gap via `/speckit-clarify` or by reworking
the plan, not by writing a placeholder answer to get past the gate.

Rationale: most of this project's real incidents were each missing one of
these four answers at the time they shipped — a "quiet" precall rule
nobody checked against chained commands (risk), a hook fix verified only
by a unit test that turned out not to match how the real host invokes it
(validation), or a fix built for one host silently left absent on another
(cross-tool availability). The gate exists to force the question to be
asked while it's still cheap to answer, not after a user reports it.

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
- **`specs/` is committed, tracked history**, not local scratch — every
  `/speckit-specify` output stays in the repository. (This supersedes an
  earlier "local only, not committed" convention from before Spec Kit was
  adopted; the pre-existing specs, SPEC-001 through SPEC-016, were reviewed
  for sensitive content — none found — and committed alongside the new
  `NNN-feature-name/` layout rather than deleted or hidden.) Before
  committing any spec, scan it for credentials, tokens, or internal-only
  detail that shouldn't be public — the review that cleared the pre-Spec
  Kit specs is a one-time pass, not a standing guarantee for specs written
  afterward.
- **Local enforcement, not CI-only enforcement**: `npm run typecheck`,
  `npm run lint`, and `npm test` MUST be enforced by a local git hook, not
  left as something only GitHub Actions catches. Concretely: `npm
  install` MUST wire `scripts/git-hooks/` as the active hooks directory
  (currently via `package.json`'s `prepare` script and git's native
  `core.hooksPath` — no external dependency required to satisfy this), a
  `pre-commit` hook MUST run lint+typecheck, and a `pre-push` hook MUST
  run the full `scripts/ci.sh`. Bypassing with `--no-verify` is not a
  normal workflow step — treat a hook that blocks a commit/push as a
  signal to fix the underlying issue, the same as a failing CI run.
  (Triggered by a real incident: an `@typescript-eslint/no-unsafe-
  assignment` error in `packages/core/src/install/merge.ts` reached
  GitHub Actions undetected because nothing enforced lint locally first —
  the same class of "only caught in CI" gap Release Discipline already
  closes for publishing.) If `scripts/git-hooks/` or the `prepare` wiring
  is ever removed, that removal itself is a constitution violation, not a
  neutral refactor — it must be replaced with an equivalent enforcement
  mechanism in the same change, not dropped.
- **Release Discipline**: `./scripts/publish-npm.sh --publish` MUST NOT be
  run without first bumping `config.version` in the root `package.json`
  and running `npm run sync-version`. npm rejects republishing an already-
  published version outright — there is no `--force` for this, and a
  failed publish attempt against a version that's already live is a sign
  the bump step was skipped, not a transient error to retry. Before every
  publish: (1) confirm the version was actually bumped since the last
  successful publish (check `npm view <package> version` against
  `package.json`'s `config.version`, don't assume), (2) `npm run
  typecheck && npm test` pass on the exact commit being published, not a
  stale local build, (3) `npm audit --audit-level=high` passes (already
  gated inside the script itself).

## Development Workflow & Review Process

1. **Specify** (`/speckit-specify`): capture the feature/fix as a spec
   before writing any code. Ambiguities get resolved here or via
   `/speckit-clarify`, not by guessing during implementation.
2. **Plan** (`/speckit-plan`): the Constitution Check gate in the plan
   template reads this file — a plan that can't satisfy Principles I–VI
   must either be redesigned or carry an explicit, justified exception in
   the plan's Complexity Tracking section. The plan template's Constitution
   Check section has the four Principle VI questions (Benefit / Risk /
   Validation / Cross-tool availability) as fields to fill, not just a
   reference back to this file — fill them with specifics for the actual
   change, not restated boilerplate.
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

**Version**: 1.4.0 | **Ratified**: 2026-06-24 | **Last Amended**: 2026-06-24
