# Quickstart: Validating OpenCode Output Token Efficiency

Prerequisites: repo installed (`npm install`), a local `opencode` CLI
installed and authenticated for at least one free-tier model.

## 1. Verify stats reliability (User Story 1)

```bash
npm test -- packages/core/src/stats.test.ts packages/core/src/report.test.ts
```

Expect: reproduction test(s) added for the flakiness bug pass — every
completed session's savings row is queryable immediately, and a no-savings
session reports zero, never a fabricated value.

## 2. Verify block-and-redirect enforcement (User Story 2)

```bash
npm test -- packages/core/src/tool-precall.test.ts packages/opencode/src/tool-precall-hook.test.ts
```

Then, live in OpenCode:

```bash
opencode run "Explain the structure of packages/core/src/tool-precall.ts without editing it"
```

Expect: the agent's first native full-read attempt on that file is blocked
with a `[ctxlite] Blocked full read of ...` message naming `smart_read`; the
agent retries via `smart_read` and completes the task.

```bash
opencode run "Add a one-line comment to packages/core/src/tool-precall.ts explaining PrecallResult"
```

Expect: the agent's full read (needed to make the edit) is **not** blocked.

## 3. Run the live benchmark harness (User Story 3)

```bash
npm run bench:live -- --mode both
```

Expect: `bench-live/results/<runId>/summary.json` and `report.txt` report a
measured output-token reduction between 70% and ~90% for `enforced` vs.
`disabled`, with no correctness regression. Rerun to check stability:

```bash
npm run bench:live -- --rerun <runId>
```

Expect: the reduction percentage on rerun is close to the original run (see
SC-002 — no wild divergence).

## 4. Verify install is not pinned to a Node version (User Story 4)

On a clean checkout, using a Node version manager to switch between the
oldest and newest supported LTS lines:

```bash
nvm install --lts=<oldest supported>   # or your version manager of choice
nvm use --lts=<oldest supported>
npm install

nvm install --lts=<newest supported>
nvm use --lts=<newest supported>
npm install
```

Expect: both installs complete with no manual native-rebuild steps; if a
mismatch does occur, the error clearly names the cause (per FR-014) rather
than a generic native-module load failure.

## 5. Full regression check

```bash
npm run typecheck && npm test && npm run lint
npm run bench       # existing deterministic suite must still pass
```

Expect: no regression in the existing deterministic `bench/` gate, and no
package drops below the 90% coverage floor (`npm run test:coverage`).
