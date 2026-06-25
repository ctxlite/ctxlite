# Specification Quality Checklist: Fix `upstream` to Carry the Real Tool Name on Claude Code/Cursor

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — references existing call sites (`hook.ts`, `cursor-hook.ts`, `optimizeToolArgs`) by name because the Investigation Findings section's purpose is documenting the actual grep/code-reading that answered the user's question; this is the subject matter, not a leaked implementation choice.
- [x] Focused on user value and business needs — gives anyone inspecting ctxlite's own data the means to self-verify "why does one category dominate this session" without re-investigating each time.
- [x] Written for non-technical stakeholders — Investigation Findings is necessarily technical (it's the requested verification), but User Scenarios/Requirements/Success Criteria describe plain before/after data behavior.
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded — FR-006 explicitly excludes adding a display feature, touching OpenCode (already correct), and fixing Cursor's separate provider-cost-accuracy problem, each with reasoning
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification (beyond the necessary Investigation Findings references noted above)

## Notes

- This spec splits the user's single suspicion into two separately-verified answers: the precall/compress skew itself is mathematically explained (not a bug, grounded in `compressToolOutput`'s real 128-token threshold and precall's actual quieting effect) — but the *reason no one can independently verify that* is a real, narrowly-scoped, low-risk bug (`upstream` silently discarding the real tool name on 2 of 3 hosts), which is what this spec actually fixes. A third, honest observation (precall's numbers are heuristic estimates, not measured) is surfaced but explicitly not "fixed," since it's a deliberate, pre-existing, documented design choice.
