/**
 * OpenCode summarizes old context when a session grows too long. Left
 * unguided, that summary tends to drop the specifics — exact file paths,
 * commands already run, decisions made — that the next turn actually needs,
 * forcing the model to re-read files it already read. Injecting a checklist
 * here costs a few dozen tokens once, instead of repeating whole tool calls.
 */
const COMPACTION_CHECKLIST = `
## ctxlite continuation checklist

Preserve in the summary, even if it means cutting other detail:
- The current objective and any sub-task in progress
- Exact file paths, symbols, and line numbers already touched
- Decisions already made and why (so they aren't re-litigated)
- Commands already run and their outcome (so they aren't re-run)
- Failed approaches (so they aren't retried)
- Test/build status and any pending verification
- Open questions or blockers for the user
`.trim()

/**
 * Appends the continuation checklist to the compaction prompt context.
 */
export function createCompactionHook(): (
  _input: { sessionID: string },
  output: { context: string[]; prompt?: string },
) => Promise<void> {
  return async (_input, output) => {
    output.context.push(COMPACTION_CHECKLIST)
  }
}
