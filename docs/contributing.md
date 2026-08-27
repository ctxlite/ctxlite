# Contributing

## Setup

### TypeScript monorepo

```bash
git clone https://github.com/ctxlite/ctxlite
cd ctxlite
npm install
npm run build
npm test
```

Supported on any currently-maintained Node.js LTS line (`engines.node:
">=20"` in `package.json` — informational, not `engine-strict`-enforced).
CI (`.github/workflows/ci.yml`) runs the full install/build/test/lint matrix
against Node 20, 22, and 24 on every push, so a working install isn't tied
to whichever version you happen to have locally. The one native dependency,
`better-sqlite3` (the stats DB), falls back automatically to Node's
built-in `node:sqlite` (Node 22+) if its prebuilt binary doesn't match your
Node version, and to Bun's `bun:sqlite` under the OpenCode plugin runtime;
if neither path works, `npm install` surfaces a specific error naming the
mismatch (`ctxlite: cannot open stats.db — better-sqlite3 native module
mismatch...`) rather than a generic native-module failure — see
`packages/core/src/sqlite-adapter.ts`.

`npm install` also points git at `scripts/git-hooks/` (via the root
`package.json`'s `prepare` script, `git config core.hooksPath
scripts/git-hooks` — no extra dependency, just git's native hook-path
config). From then on: **`git commit` runs lint + typecheck**,
**`git push` runs the full `scripts/ci.sh`** (typecheck, build, test,
lint, version-sync check, MCP console.log check, `npm audit
--audit-level=high`). This exists because a lint error
(`@typescript-eslint/no-unsafe-assignment` in
`packages/core/src/install/merge.ts`) once shipped to a commit and was
only ever caught by GitHub Actions, costing a CI run to discover
something `npm run lint` would have caught locally in seconds. If a hook
ever blocks you incorrectly, fix the underlying issue — don't reach for
`git commit --no-verify`/`git push --no-verify` as the default response.

### Go proxy (legacy binary)

```bash
go mod download
make build
make test
```

## Workflow

Per the constitution's Principle I, anything beyond a trivial one-line fix
or pure-docs edit goes through Spec Kit, not straight into a branch:

1. Fork repo, `git checkout -b feat/your-feature`
2. `/speckit-specify` — write the spec before any code. Resolve ambiguity
   here or via `/speckit-clarify`, not while implementing.
3. `/speckit-plan` — fill the Constitution Check's four fields concretely:
   **Benefit** (what this achieves, measurably), **Risk** (what's most
   likely to break), **Validation** (the actual test or live host check,
   named), **Cross-tool availability** (does it apply to every host
   ctxlite supports, and if not, is the gap a documented platform
   constraint or a follow-up task?). A generic or missing answer to any of
   the four fails this gate (Principle VI) — see
   `.specify/templates/plan-template.md` for the exact fields.
4. `/speckit-tasks` then `/speckit-implement` — tests are mandatory for
   every task that changes behavior in `packages/*/src` (Principle II),
   never optional regardless of what a template default elsewhere says.
5. TypeScript: `npm run typecheck && npm test && npm run lint`. Go:
   `make lint && make test`. Confirm coverage didn't drop below 90% for
   any package: `npm run test:coverage`. For changes to token-savings
   logic (`tool-output-compress.ts`, `context-prune.ts`, hook logging), also
   run `npm run bench` and confirm `Regression Verdict: PASS` — see
   [benchmarks.md](./benchmarks.md).
6. `/speckit-analyze` — cross-artifact consistency, plus a correctness
   review (`/code-review`, or an equivalent independent pass). Both run
   before the work is mergeable (Principle III) — "it works" isn't the
   same claim as "it was reviewed."
7. Open a PR to `main`. To review someone else's PR (or your own before
   merging) against everything above in one pass, run `/speckit-review
   <PR number or URL>` — it checks out the PR's code in an isolated git
   worktree (never touching your working directory), runs local CI parity,
   the coverage floor, the Heuristic Gate fields, and `ctxlite-internals`
   compliance for any fragile-area files touched. It only ever reports
   findings in the conversation — it never posts to GitHub on its own.

"Trivial" (steps 2-4 skippable) means: no behavior change, no new file, no
test impact — typo fixes, comment wording, a dependency bump already
decided elsewhere. When in doubt, treat it as non-trivial.

## Specs

Specs live in `specs/` and are **committed, tracked history** — not local
scratch. (This changed from an earlier "local only" convention; the old
specs, SPEC-001 through SPEC-016, were reviewed for sensitive content and
committed alongside the new Spec Kit-managed `NNN-feature-name/` layout.)
Per the constitution's Principle I, anything beyond a trivial change goes
through `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`, which creates the feature's directory under `specs/`
automatically. Read the relevant spec before implementing. After
implementation, mark `[x] Done` and link the PR.

## Commit style

```
feat: add semantic cache L2 lookup
fix: bind proxy to loopback only
docs: add configuration reference
test: add BM25 trimmer table tests
```

## Code style

- Go: `.cursor/rules/go-style.mdc`
- TypeScript: `.cursor/rules/ts-style.mdc`

## Version sync (TypeScript packages)

```bash
# 1. Bump version in root package.json → config.version
# 2. Propagate to all packages
npm run sync-version
```

## CI without GitHub Actions minutes

Run the same checks locally:

```bash
./scripts/ci.sh
```

This mirrors `.github/workflows/ci.yml` (typecheck, build, test, lint, version sync, MCP console.log check).

## Release (TypeScript packages)

### GitHub secret required

Add in GitHub repo → Settings → Secrets and variables → Actions:

| Name | Value |
|------|-------|
| `NPM_TOKEN` | npm automation token from `npm token create --type=automation` |

Never commit tokens to the repository.

### Release flow

```bash
# 1. Bump version in root package.json → config.version
# 2. Sync all package.json files
node scripts/sync-version.js

# 3. Update CHANGELOG.md

# 4. Commit + tag
git add -A
git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

Pushing a `v*.*.*` tag triggers `.github/workflows/release.yml`, which:

1. Builds and tests all packages
2. Verifies `config.version` matches the tag
3. Publishes `@ctxlite/core`, `@ctxlite/opencode`, `@ctxlite/mcp`, and `@ctxlite/cli` to npm
4. Creates a GitHub Release

### Manual npm publish (local)

**Do not run `npm publish` from the repo root.** The root `package.json` is `private` and has no top-level `version` field (version lives in `config.version`), which causes npm to crash with:

`Cannot read properties of null (reading 'prerelease')`

**Before publishing, confirm the version was actually bumped** — `npm view @ctxlite/cli version` (or any of the four packages) against `package.json`'s `config.version`. npm rejects republishing a version that's already live with no `--force` option; that's not a transient error, it's a sign the bump-and-sync-version step above was skipped. See the constitution's Release Discipline constraint.

Publish workspace packages in order:

```bash
npm run build
npm run publish:npm          # dry-run all four packages
npm run publish:npm:live     # publish (requires npm login or NPM_TOKEN)
```

Or publish one package at a time:

```bash
cd packages/core && npm publish --access public
cd ../opencode && npm publish --access public
cd ../mcp && npm publish --access public
cd ../cli && npm publish --access public
```

## Go binary (legacy)

The Go HTTP proxy and platform npm wrappers under `npm/` can still be built locally:

```bash
make build-all
make npm-install-local
./scripts/release.sh X.Y.Z --publish
```

Cross-compilation notes apply as documented in `scripts/release.sh`.
