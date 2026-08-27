/** Tracks pre-call optimizations until the matching tool.execute.after runs. */
export interface PrecallPending {
  estimatedTokensSaved: number
  label?: string
}

const pending = new Map<string, PrecallPending>()

function key(sessionID: string, callID: string): string {
  return `${sessionID}:${callID}`
}

export function markPrecallPending(sessionID: string, callID: string, entry: PrecallPending): void {
  pending.set(key(sessionID, callID), entry)
}

export function takePrecallPending(sessionID: string, callID: string): PrecallPending | undefined {
  const k = key(sessionID, callID)
  const entry = pending.get(k)
  if (entry) {
    pending.delete(k)
  }
  return entry
}

/**
 * Tracks, per session+path, whether the agent has already engaged with a
 * path via `smart_read` or an edit/write-like tool (spec 026, User Story 2).
 * A subsequent full `read` of that same path is then treated as
 * edit-intent — the agent already has the structural picture (or is mid-edit)
 * and is retrying for exact content, not doing a first-pass exploration a
 * cheaper tool could have served. Deliberately NOT set by a blocked read
 * itself: if it were, the agent could bypass enforcement just by repeating
 * the identical blocked `read` call. Session-scoped and unbounded for the
 * life of the plugin process — a session's engaged-path set is small and
 * plugin processes are short-lived (one per OpenCode run).
 */
const engagedPaths = new Map<string, Set<string>>()

function pathKey(sessionID: string): string {
  return sessionID
}

export function markPathEngaged(sessionID: string, path: string): void {
  let set = engagedPaths.get(pathKey(sessionID))
  if (!set) {
    set = new Set()
    engagedPaths.set(pathKey(sessionID), set)
  }
  set.add(path)
}

export function hasPathEngagement(sessionID: string, path: string): boolean {
  return engagedPaths.get(pathKey(sessionID))?.has(path) ?? false
}
