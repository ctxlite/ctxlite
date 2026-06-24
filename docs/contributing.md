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

### Go proxy (legacy binary)

```bash
go mod download
make build
make test
```

## Workflow

1. Fork repo
2. `git checkout -b feat/your-feature`
3. Make your changes
4. TypeScript: `npm run typecheck && npm test && npm run lint`
5. Go: `make lint && make test`
6. Open a PR to `main`

## Specs

Specs live in `specs/` (local only, not committed).  
Read the relevant spec before implementing.  
After implementation, mark `[x] Done` and link the PR.

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
