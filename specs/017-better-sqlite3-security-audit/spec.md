# Feature Specification: better-sqlite3 Security Findings Audit

**Feature Branch**: `017-better-sqlite3-security-audit`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Socket.dev flagged @ctxlite/mcp's dependency tree with 'Obfuscated code' (1 instance, 1 package) on better-sqlite3, plus an AI-generated write-up describing a PRAGMA-statement string-interpolation risk ('directly interpolating an unvalidated caller-provided string into a PRAGMA SQL statement'). Research (via web search, context7 MCP was unavailable in this session) what's actually going on and what version to use to not have malicious code."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Maintainer confirms a flagged dependency isn't actually compromised (Priority: P1)

A maintainer sees a Socket.dev/npm-audit-style security alert against `better-sqlite3` (the SQLite driver `@ctxlite/core` uses under Node) and needs to know, with evidence, whether it's a real issue requiring action or a false positive/inherent-to-the-API pattern that can be closed out.

**Why this priority**: An unresolved security alert on a published package is reputational and practical risk regardless of whether it's real — it must be either fixed or closed with a documented reason, not left open indefinitely.

**Independent Test**: Can be fully verified by reading this spec's Findings section and cross-checking the cited sources; no code change is required to complete this story.

**Acceptance Scenarios**:

1. **Given** the Socket.dev "Obfuscated code" and AI-anomaly findings on better-sqlite3, **When** a maintainer reads this spec, **Then** they can see the specific evidence (source file inspected, advisory databases checked, exact version compared against the June 2026 node-gyp supply-chain compromise's confirmed package list) supporting the conclusion, not just an assertion that it's fine.
2. **Given** the conclusion that no version change is needed, **When** task #32 (tracked separately) is revisited, **Then** this spec is the cited evidence closing the better-sqlite3-specific portion of it.

---

### User Story 2 - Future readers understand why ctxlite's own PRAGMA usage is safe (Priority: P2)

A future contributor (or the `ctxlite-internals` skill's reader) needs to understand why ctxlite's three `PRAGMA` calls in `sqlite-adapter.ts`/`sqlite-bun.ts` don't carry the injection risk the AI-anomaly description describes, so a future change doesn't either.

**Why this priority**: Lower than User Story 1 because it's documentation for future-proofing, not closing an open alert — but still necessary so the "safe because we only pass literals" property is checked, not just true by accident today.

**Independent Test**: Can be verified by grepping `packages/core/src/*.ts` for `pragma`/`PRAGMA` usage and confirming every call site uses a literal string constant, never a variable derived from external input.

**Acceptance Scenarios**:

1. **Given** the three PRAGMA call sites (`journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`), **When** a contributor reads the relevant code, **Then** it's evident each is a hardcoded literal, not caller/user-controlled input.

### Edge Cases

- What happens if a future change adds a PRAGMA call that *does* take a variable argument (e.g., an exposed "vacuum" or "integrity_check" admin tool)? → Out of scope for this spec; flagged as a forward-looking constraint in Requirements below so it isn't introduced silently.
- What happens if better-sqlite3 is later confirmed compromised in a *future* advisory? → Out of scope; this spec's conclusion is time-scoped to the investigation date (2026-06-24) and the version installed at that time (12.11.1).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The investigation MUST determine whether `better-sqlite3` (any version currently in ctxlite's dependency tree) appears in the confirmed package list of the "Node-gyp Supply Chain Compromise – June 2026" (Snyk-tracked, 57 packages, Critical/Embedded-Malicious-Code).
- **FR-002**: The investigation MUST check `better-sqlite3`'s package-specific advisory record (Snyk's per-package vulnerability page, or equivalent) for the exact version installed.
- **FR-003**: The investigation MUST inspect the actual source of the PRAGMA call the AI-anomaly finding describes (`node_modules/better-sqlite3/lib/methods/pragma.js`) to determine whether the described pattern is a defect introduced by the package, or an unavoidable consequence of SQLite's own grammar (PRAGMA statements don't support bound parameters in any SQLite driver).
- **FR-004**: The investigation MUST audit every call site of `.pragma()`/`PRAGMA` within `packages/core/src/*.ts` (ctxlite's own code, not the dependency) and confirm whether any pass a non-literal (variable, external-input-derived) string.
- **FR-005**: The outcome (safe as-is / needs a version bump / needs a code change) MUST be recorded with its supporting evidence in a form that closes out the relevant portion of task #32 (Socket.dev finding investigation), not just in this spec file in isolation.
- **FR-006 (forward-looking constraint)**: Any future PRAGMA call added to `packages/core/src/*.ts` that takes a non-literal argument MUST go through the same Implementation Heuristic Gate (constitution Principle VI) with the Risk question answered specifically against this exact injection pattern.

### Key Entities

- **better-sqlite3**: The native SQLite driver `@ctxlite/core` depends on under Node.js (not Bun) for `~/.ctxlite/stats.db` access. Currently pinned `^12.11.0` in `packages/core/package.json`, installed version `12.11.1`.
- **Socket.dev finding**: A third-party security-scanner alert against the published `@ctxlite/mcp` npm package's dependency tree (not against ctxlite's own source).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer reading this spec can answer "is better-sqlite3 part of the June 2026 node-gyp worm?" with a yes/no backed by a named, checkable source, in under 1 minute (no further research needed).
- **SC-002**: A maintainer can answer "does ctxlite's own code pass untrusted input into a PRAGMA statement?" with a yes/no backed by the exact file/line, in under 1 minute.
- **SC-003**: Task #32 has at least the better-sqlite3-specific portion of its scope marked resolved, with this spec cited as the evidence.

## Assumptions

- The Snyk advisory pages fetched on 2026-06-24 (`security.snyk.io/package/npm/better-sqlite3` and `security.snyk.io/node-gyp-supply-chain-compromise-june-2026`) are accurate and current as of that date; if either page's content changes materially after this date, the conclusion below should be re-verified, not assumed to still hold indefinitely.
- context7 MCP was requested by the user but is not configured as an available tool in this session; web search was used instead. If context7 becomes available, re-running this same research through it is a reasonable follow-up but is not expected to change the conclusion, since the underlying facts (confirmed package list, package source code) don't depend on which research tool retrieves them.
- "Malicious code" in the user's request is interpreted as: code that exfiltrates data, executes attacker-controlled payloads, or was published as part of a known supply-chain compromise — not "any string-interpolated SQL", which is a code-quality/API-design concern, not malware.

## Findings (investigation result, recorded ahead of planning)

1. **better-sqlite3 is NOT among the 57 packages confirmed compromised** in the Node-gyp Supply Chain Compromise (a.k.a. "Phantom Gyp"/"Miasma", tracked by Snyk and StepSecurity, active since 2026-06-03). The confirmed list (`@vapi-ai/server-sdk`, the `autotel-*` family, `ai-sdk-ollama`, `awaitly`, and others) does not include `better-sqlite3` at any version. An earlier, less specific web-search summary loosely associated better-sqlite3 with "packages that use node-gyp" as a *class* at elevated risk generally — that is not the same claim as "this package was compromised," and the package-specific advisory page contradicts it directly.
2. **Snyk's package-specific page for `better-sqlite3` lists zero vulnerabilities** across all recent versions, including the installed `12.11.1`.
3. **The "PRAGMA injection" pattern is real in the source, but not exploitable by ctxlite.** `node_modules/better-sqlite3/lib/methods/pragma.js` does execute `PRAGMA ${source}` via direct string template — confirmed by reading the file directly. This is not a flaw specific to better-sqlite3: SQLite's `PRAGMA` statement grammar does not support bound/parameterized arguments in *any* driver (this is also true of Node's built-in `node:sqlite`), so every library exposing a `.pragma()`-style helper does the same string-templating internally — it is the only way to implement that API surface, not negligence.
4. **ctxlite's own usage is exactly three call sites, all hardcoded literals**: `"journal_mode = WAL"`, `"synchronous = NORMAL"`, `"busy_timeout = 5000"` (`packages/core/src/sqlite-adapter.ts:65-67,77-79`, `packages/core/src/sqlite-bun.ts:24-26`). None are derived from tool input, file content, or any other external/caller-controlled source. The Socket.dev/AI-anomaly description's own caveat — "If the function is used only internally with controlled strings, the risk is low" — is the exact situation here.

**Conclusion**: No version change and no code change is needed. The Socket.dev findings on better-sqlite3 are accounted for: "Obfuscated code" most likely refers to minified/compiled native-binding glue code bundled in the package (normal for native addons, not evidence of the June 2026 compromise, which this package is independently confirmed not to be part of), and the AI-detected PRAGMA pattern is a correctly-flagged-but-not-applicable-here API characteristic. This spec, plus FR-006's forward-looking constraint, is the artifact that closes the better-sqlite3 portion of task #32.
