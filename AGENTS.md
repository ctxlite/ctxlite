# Agent orientation

This is a TypeScript npm workspace monorepo (`packages/core`, `opencode`,
`mcp`, `cli`) plus a legacy Go HTTP proxy (`go/`, `npm/`) that's no longer
under active development. See `docs/architecture.md` for how the pieces fit
together, `docs/contributing.md` for build/test/release commands, and
`docs/configuration.md` for the user-facing per-host setup.

## Before touching specific areas

- `packages/core/src/tool-precall.ts`, `packages/core/src/install/`, or the
  SQLite schema in `packages/core/src/stats.ts` — read the
  `ctxlite-internals` skill first (`.claude/skills/ctxlite-internals/`,
  also present for Cursor and OpenCode). These are the places that have
  shipped real, user-visible regressions before; the skill documents the
  specific failure mode for each.
- TypeScript/Go style, security rules, and repo layout conventions are in
  `.cursor/rules/*.mdc` — they apply regardless of which tool you're using.

## Hard constraints

- Business logic lives only in `@ctxlite/core`. `opencode`, `mcp`, and
  `cli` are thin adapters that call into `core` — never duplicate logic in
  an adapter package.
- All TypeScript packages share one version, defined once in root
  `package.json`'s `config.version` and propagated via `npm run
  sync-version`. Don't hand-edit a package's own `version` field.
- Tests use real temp directories for filesystem I/O, never a faked
  filesystem. `os.homedir()` is the one thing that does get mocked — see
  the `ctxlite-internals` skill for why import-time ordering matters there.
- Run `npm run typecheck && npm test` before considering a TypeScript
  change done. `npm run lint` too if you touched anything under
  `packages/*/src`.
