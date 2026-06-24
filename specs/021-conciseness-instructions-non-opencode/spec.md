# Feature Specification: Deliver Conciseness Instructions to Claude Code and Cursor

**Feature Branch**: `021-conciseness-instructions-non-opencode`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: pasted `ctxlite stats --by-session <host>` output (using the host filter shipped in `specs/020-stats-filter-by-host/`) for Claude Code and Cursor sessions, showing `prune`, `compact`, `smart_read`, `trim`, and `concise` permanently at zero on both hosts even across sessions with 50-70+ requests, while `precall`/`compress` are active. The user asked to investigate locally whether this is a bug and provide a definitive answer.

## Investigation Findings (pre-spec research, not a placeholder)

Verified against the actual code and current official hook documentation for both hosts (not assumed) before writing this spec. The five always-zero categories split into three genuinely different explanations:

1. **`smart_read` and `trim` (trim_context) are NOT a bug — they're on-demand MCP tools, and they log under `host: "mcp"`, never under `"claude-code"`/`"cursor"`.** Both are tools the agent must explicitly decide to call (no automatic hook triggers them) — confirmed in `packages/opencode/src/smart-read-tool.ts`/`tools.ts` (OpenCode's in-process versions, logged as `host: "opencode"`) versus `packages/mcp/src/tools/smart-read.ts`/`trim-context.ts` (the MCP versions Claude Code/Cursor actually use, both hardcoded to `host: "mcp"` — already documented as a real, deliberate distinction in `specs/020-stats-filter-by-host/spec.md` Investigation Findings #5). Filtering `--by-session` to `claude-code` or `cursor` specifically *excludes* this activity by construction, even if the agent used those tools heavily in the same session — it would show under `ctxlite stats --by-session mcp` instead. This is a real, slightly confusing UX consequence of how host labels work, but not a defect in the optimization itself.

2. **`prune` and `compact` are NOT a bug — they require full conversation-message-array access that neither host's hook system exposes, confirmed against each host's current official documentation.** `pruneMessageContext`/`capStaleToolOutputs` (`packages/core/src/context-prune.ts`) are called from exactly one place in the entire codebase: `packages/opencode/src/messages-transform-hook.ts`, bound to an OpenCode plugin event that hands the hook the *entire* `messages` array before each LLM request. Checked Claude Code's complete hook event list (30 events: `PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`, `UserPromptSubmit`, etc.) against its hooks reference — none of them deliver the conversation history itself; hooks only ever receive `transcript_path` (a file path, not contents) plus event-specific narrow fields (one tool's input/output, the current prompt, etc.). Checked Cursor's complete hook event list (`preToolUse`, `postToolUse`, `beforeSubmitPrompt`, `preCompact`, `afterAgentResponse`, etc.) the same way — same result: no event exposes the message array, and Cursor's own `preCompact` is explicitly documented as observational-only (counts/percentages, not message contents). Replicating OpenCode's prune/compact mechanism on either host today is not possible through their documented, supported hook surfaces — this is a real platform constraint, not a gap this project failed to wire up.

3. **`concise` is a genuine, closeable gap — but only its instruction-delivery half, not its savings-measurement half.** `CONCISENESS_INSTRUCTIONS` (`packages/opencode/src/system-prompt.ts`) — the actual text telling the model to skip preamble/recap/sign-off — is wired into exactly one place: `packages/opencode/src/index.ts`'s `buildSystemPromptAddition()`, injected into OpenCode's system prompt only. Grepped every other package: zero references. Claude Code and Cursor sessions never receive this instruction at all today, through any mechanism. Separately, the savings *measurement* (`logConcisenessSavings`, called from `packages/opencode/src/stats-events.ts` on OpenCode's `message.updated` plugin event, using `info.tokens.output`/`.reasoning` from that event's payload) has no equivalent trigger on Claude Code (`Stop`'s payload does not include token usage, confirmed against current docs — it would require parsing the `transcript_path` JSONL file's internal, undocumented schema) or Cursor (`afterAgentResponse`'s exact payload wasn't fully documented, but no token-usage field is mentioned anywhere in the hook reference). Measuring `concise` savings for these hosts is not ruled out forever, but isn't a low-risk change today — it depends on undocumented internals that could change without notice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Claude Code and Cursor sessions receive the same conciseness instructions OpenCode sessions already get (Priority: P1)

A user installs ctxlite for Claude Code or Cursor (`ctxlite install --tool claude-code` / `--tool cursor`). Today, only OpenCode sessions get the token-efficiency system-prompt instructions (skip preamble, skip recap, prefer inline comments, etc.) that reduce output verbosity. After this feature, Claude Code sessions get the same instructions via their project `CLAUDE.md`, and Cursor sessions get them via a project rule file — both using each host's own real, already-proven instruction-delivery mechanism (not a new one invented for this feature).

**Why this priority**: This is the one concretely closeable gap out of the three investigated — actionable today, without depending on any documentation-unconfirmed or fragile mechanism, unlike `prune`/`compact` (confirmed impossible) or `concise` measurement (depends on undocumented internals).

**Independent Test**: Run `ctxlite install --tool claude-code --scope project --yes` in a fresh project; confirm the project's `CLAUDE.md` contains the conciseness instructions in a clearly delimited, idempotent block. Run `ctxlite install --tool cursor --scope project --yes`; confirm a Cursor rule file containing the same instructions exists.

**Acceptance Scenarios**:

1. **Given** a project with no existing `CLAUDE.md`, **When** `ctxlite install --tool claude-code` runs, **Then** a `CLAUDE.md` is created containing the conciseness instructions inside a clearly marked block (so a future ctxlite update can find and replace just that block, the same pattern `merge.ts` already uses for hook/skill blocks elsewhere).
2. **Given** a project with an existing `CLAUDE.md` containing unrelated content, **When** `ctxlite install --tool claude-code` runs, **Then** the existing content is preserved and the marked block is appended, not overwritten.
3. **Given** `ctxlite install --tool claude-code` has already run once, **When** it runs again, **Then** the file is unchanged (idempotent — no duplicate blocks).
4. **Given** `ctxlite install --tool cursor` runs, **Then** a Cursor project rule file (`.cursor/rules/<name>.mdc`, the existing convention this project's own `.cursor/rules/` directory already uses) is created or updated with the same instructions, following the same create/update/idempotent rules as Claude Code's `CLAUDE.md` block.
5. **Given** `ctxlite uninstall` (or the install command's removal path) runs for either host, **Then** the marked block is removed, leaving the rest of the file intact — mirroring how hook/skill blocks are already removed elsewhere.

### Edge Cases

- What happens to a project that installed ctxlite before this feature shipped? → Re-running `ctxlite install` for that tool adds the new block — consistent with this project's own documented precedent ("`ctxlite install` only writes a *new* install target on a run *after* that target was added... expected, not a bug, but call it out in the CHANGELOG" — `ctxlite-internals` skill, `core/install/` section).
- What happens if a user has manually written conflicting instructions into their own `CLAUDE.md` (e.g. "always explain your reasoning in detail")? → Out of scope to detect or reconcile — the marked block is additive text, same as every other ctxlite-managed block; resolving conflicting instructions is the user's own editorial decision, not something this feature arbitrates.
- What happens for `--scope global` versus `--scope project`? → Both supported, writing to the global (`~/.claude/CLAUDE.md`, `~/.cursor/rules/`) or project-local path respectively, mirroring the existing scope handling already used for hooks/skills/MCP config.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST deliver the existing `CONCISENESS_INSTRUCTIONS` text (currently OpenCode-only) to Claude Code via a marked, idempotent block in `CLAUDE.md` when `ctxlite install --tool claude-code` runs.
- **FR-002**: System MUST deliver the same instructions to Cursor via a marked, idempotent block in a project rule file when `ctxlite install --tool cursor` runs.
- **FR-003**: Both delivery mechanisms MUST follow this project's existing merge-block conventions (create if absent, append if other content exists, no duplication on re-run, clean removal on uninstall) — the same pattern already used for hook/skill installation, not a new pattern invented for this feature.
- **FR-004**: This feature MUST NOT attempt to replicate `prune`/`compact` on Claude Code or Cursor — confirmed architecturally unsupported by both hosts' current documented hook surfaces (Investigation Finding #2).
- **FR-005**: This feature MUST NOT attempt to measure `concise` token savings for Claude Code or Cursor sessions — doing so would require parsing undocumented internal data (`transcript_path`'s JSONL schema, or an unconfirmed Cursor payload field), which this project's conventions treat as too fragile to depend on without further dedicated investigation (Investigation Finding #3). This is the one piece of the original gap left genuinely unresolved, not silently dropped — see Assumptions.
- **FR-006 (explicitly out of scope)**: This spec does NOT change how `smart_read`/`trim_context` log their host value, and does NOT attempt to merge `mcp`-labeled activity into `claude-code`/`cursor`-labeled stats — that distinction is real, already documented (`020`), and changing it would require the MCP protocol to expose client identity, which it doesn't (the same conclusion `020`'s spec already reached).

### Key Entities

N/A — no new data entities; this adds one new install target (`ConfigKind`) per host, following the existing `claude-code-skill`/`cursor-skill` pattern already in `packages/core/src/install/types.ts`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Claude Code or Cursor session, after a fresh `ctxlite install`, receives the same token-efficiency instructions (skip preamble/recap/sign-off, etc.) an OpenCode session already receives — verifiable by inspecting the installed `CLAUDE.md`/rule file content directly.
- **SC-002**: Running `ctxlite install` twice for the same tool produces byte-identical output the second time (true idempotency) — no duplicate blocks accumulate across repeated installs.
- **SC-003**: The user's original question — "is this a bug?" — has one concrete, citable answer per category (not a hand-wave): smart_read/trim → host-label artifact, not a bug; prune/compact → confirmed platform limitation, not a bug; concise → real gap, now closed for instruction delivery (measurement explicitly deferred with a stated reason).

## Assumptions

- Measuring `concise` savings for Claude Code/Cursor is explicitly deferred, not abandoned — if either host's hook documentation is ever updated to include per-turn token usage in a hook payload (`Stop`, `afterAgentResponse`, or any future event), that would be the trigger to revisit this as a small, low-risk follow-up feature. Until then, attempting it via undocumented transcript-parsing fails this project's own Implementation Heuristic Gate Risk question (depends on internals that could silently break with a host update, with no way to detect the breakage other than savings quietly going to zero).
- Cursor's project rule file format (`.mdc`, frontmatter + body) is assumed compatible with a plain instructional-text body, consistent with how this project's own `.cursor/rules/security.mdc` (referenced elsewhere in this project's planning docs) is already structured — no new file format is being invented.
- No new external dependency needed — this reuses the existing merge-block read/write logic pattern already proven for hooks and skills, just targeting two new file paths.
