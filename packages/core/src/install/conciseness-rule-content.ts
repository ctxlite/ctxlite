/**
 * Conciseness instructions, copied by value from
 * packages/opencode/src/system-prompt.ts's CONCISENESS_INSTRUCTIONS —
 * @ctxlite/core cannot import from @ctxlite/opencode (the dependency runs
 * the other way), so this is a deliberate duplicate, not a re-export.
 * OpenCode already delivers this text via an unconditional system-prompt
 * injection; Claude Code and Cursor have no equivalent injection point, so
 * each gets it via a dedicated, always-loaded rule file instead.
 */
const INSTRUCTIONS_BODY = `
## Token efficiency (ctxlite)

When you need to understand a file's structure or API rather than edit
it (checking what a module exports, how a class is shaped, whether a
function exists before calling it), use smart_read instead of the
regular read tool — it returns signatures without implementation bodies.
Use the regular read tool when you need exact content to edit.

After reading several candidate files for a multi-file task (refactor,
"how does X work", cross-file search), call trim_context with their
content and the task description before continuing — drop the files it
excludes from further reasoning instead of carrying all of them forward.
Skip this for a single known file.

When responding, apply these rules to reduce token usage:

- Skip preamble: never start with "Great question!", "Sure!", "Of course!",
  "I'll help you with that", or similar filler phrases.
- Skip recap: do not restate what the user asked before answering.
- Skip sign-off: do not end with "Let me know if you need anything else!",
  "Hope this helps!", "Feel free to ask!", or similar.
- Skip obvious reasoning: if the implementation is straightforward,
  write the code — don't narrate the plan first.
- Prefer inline comments over long explanations: explain tricky parts
  with a comment in the code, not a paragraph before it.
- Be direct on errors: state what's wrong and how to fix it.
  Don't apologize or over-explain why it happened.

These rules apply to all responses. Code quality and correctness
are not affected — only unnecessary verbosity is reduced.
`.trim()

/**
 * Claude Code loads every file under `.claude/rules/` unconditionally at
 * session start when it has no `paths` frontmatter — same priority as
 * `CLAUDE.md` (confirmed against Claude Code's current documentation).
 * Plain Markdown, no frontmatter needed.
 */
export const CLAUDE_CODE_CONCISENESS_RULE_CONTENT = INSTRUCTIONS_BODY + "\n"

/**
 * Cursor's `.cursor/rules/*.mdc` files load unconditionally when
 * `alwaysApply: true` — matching this project's own `.cursor/rules/security.mdc`.
 */
export const CURSOR_CONCISENESS_RULE_CONTENT = `---
description: ctxlite token-efficiency instructions
alwaysApply: true
---

${INSTRUCTIONS_BODY}
`
