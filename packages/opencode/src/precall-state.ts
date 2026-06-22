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
