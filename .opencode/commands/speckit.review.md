---
description: Review a GitHub PR against this repository's constitution — Spec Kit artifact consistency, the Implementation Heuristic Gate (Principle VI), coverage floor, local CI checks run on the PR's actual code, and ctxlite-internals compliance for fragile areas. Reports findings only — never posts to GitHub automatically.
---

## User Input

```text
$ARGUMENTS
```

**This is a ctxlite-specific addition, not an official GitHub Spec Kit command.** It complements `/speckit-analyze` (which only ever looks at the artifacts already on disk in the current working tree) by checking the actual code of a PR's branch, in isolation, without touching the user's working directory — and by enforcing this repository's own constitution, not generic Spec Kit conventions.

**Never run `gh pr comment`, `gh pr review`, or any other GitHub-mutating command as part of this skill.** Report findings back to the user in the conversation; let them decide whether and how to post anything.

## Resolving the PR

1. If `$ARGUMENTS` is empty, run `gh pr view --json number,url 2>&1` to check whether the current branch has an associated PR. If that also fails, ask the user for a PR number or URL — do not guess.
2. Otherwise, extract the PR number from `$ARGUMENTS` (a bare number, or the trailing `/pull/<N>` segment of a URL).
3. Fetch PR metadata: `gh pr view <N> --json number,title,headRefName,baseRefName,url,body,files,additions,deletions`.

## Isolating the PR's code (never touch the user's working tree)

4. Create a throwaway git worktree on the PR's head ref, rather than checking out the branch in the current working directory:

   ```bash
   WORKTREE_DIR="$(mktemp -d)/ctxlite-pr-<N>"
   git fetch origin "pull/<N>/head:pr-<N>-review" 2>&1 || git fetch origin "<headRefName>"
   git worktree add "$WORKTREE_DIR" "pr-<N>-review" 2>&1 || git worktree add "$WORKTREE_DIR" "origin/<headRefName>"
   ```

5. Run `npm ci` inside `$WORKTREE_DIR` (not the main checkout) before any other command — every subsequent check runs `cd "$WORKTREE_DIR" && ...`, never in the main working directory.
6. **Always clean up at the end, even on failure**: `git worktree remove "$WORKTREE_DIR" --force` and `git branch -D pr-<N>-review` (if created), then `rm -rf` the temp parent directory. Treat this as a `finally` block — if any check below errors, still run cleanup before reporting.

## Checks to run (in the worktree, against the PR's actual code)

7. **Local CI parity** — run `./scripts/ci.sh` inside the worktree (typecheck, build, test, lint, version-sync check, MCP console.log check, `npm audit --audit-level=high`). Record pass/fail per step, not just the final exit code — a failure partway through still tells you which step failed.
8. **Coverage floor (Constitution Principle II)** — run `npm run test:coverage` in the worktree. For every package under `packages/*` reported in the table, confirm statement/line coverage is **not below 90%**. If the PR's diff touches a package, that package's number is the one that matters most; report all of them regardless.
9. **Implementation Heuristic Gate (Principle VI)** — determine whether this PR corresponds to a Spec Kit feature:
   - Check the PR body/commits for a reference to `specs/NNN-feature-name/` (search PR body text and `git log --oneline` in the worktree for a `specs/` path).
   - If found, read that feature's `plan.md` in the worktree and verify its Constitution Check section answers **Benefit / Risk / Validation / Cross-tool availability** with specifics for this exact change — not generic or template placeholder text (`[ANSWER — ...]`, `NEEDS CLARIFICATION`, or anything copy-pasted verbatim from the template's own example text counts as failing this check).
   - If no `specs/` reference exists at all for a non-trivial PR (per Principle I's definition of "trivial"), that itself is a finding — flag it, don't silently skip the rest of this check.
10. **ctxlite-internals compliance** — if the PR's changed files (from step 3's `files` list) include any of `packages/core/src/tool-precall.ts`, anything under `packages/core/src/install/`, or `packages/core/src/stats.ts`:
    - Re-read `.opencode/skills/ctxlite-internals/SKILL.md` for the specific rules tied to whichever file(s) are touched.
    - Check the PR's diff (`git diff <baseRefName>...<headRefName>` in the worktree) against each applicable rule (e.g., a new `tool-precall.ts` pattern: does it match against `segmentSkeleton` post-`stripEmbeddedText`? Is there a regression test for the chained-command and quoted-prose-false-positive cases? A new `install/paths.ts` entry: is the path verified against the host's own introspection, not guessed?).
    - This step requires judgment, not just a mechanical check — read the actual diff and reason about it the way the skill describes the past incidents, don't just confirm a test file exists.

## Report

Produce a report in the same spirit as `/speckit-analyze`'s findings table — a CRITICAL/HIGH/MEDIUM/LOW severity table, plus a clear PASS/FAIL per check (7-10 above), plus an overall recommendation (mergeable / needs-changes / blocked). Do not post this anywhere — output it directly in the conversation and stop. If the user wants it posted to the PR, they will ask explicitly; do not offer to do it for them as a default next step beyond a one-line mention that it's possible.
