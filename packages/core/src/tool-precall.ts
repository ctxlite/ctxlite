/** Heuristic tokens prevented by quieter command flags (conservative). */
const PRECALL_ESTIMATES: Record<string, number> = {
  npm_test: 800,
  npm_build: 400,
  npm_install: 300,
  cargo_test: 600,
  cargo_build: 400,
  dotnet: 500,
  pytest: 500,
  pip_install: 300,
  composer_install: 300,
  bundle_install: 300,
  maven: 500,
  gradle: 500,
  make: 300,
  vite_build: 400,
  docker_logs: 700,
  curl: 200,
  generic_quiet: 300,
}

export interface PrecallResult {
  args: Record<string, unknown>
  modified: boolean
  blocked: boolean
  blockReason?: string
  /** Estimated tokens prevented when modified or blocked. */
  estimatedTokensSaved: number
  label?: string
}

function hasFlag(command: string, flags: string[]): boolean {
  return flags.some((f) => command.includes(f))
}

function appendFlag(command: string, flag: string): string {
  const trimmed = command.trimEnd()
  if (trimmed.endsWith(flag) || trimmed.includes(`${flag} `)) {
    return command
  }
  return `${trimmed} ${flag}`
}

interface Segment {
  start: number
  end: number
}

/**
 * `&&`/`||`/`;`/`|` mean the matched command (e.g. "npm run build") isn't
 * necessarily the last thing in the string — appendFlag's naive "stick it on
 * the end" approach would then attach the flag to a DIFFERENT command
 * instead (e.g. `npm run build | tail -20` becoming
 * `... | tail -20 --loglevel=warn`, which breaks tail). Splitting on
 * top-level operators first and rewriting only the matched segment avoids
 * that, while still leaving every other segment byte-for-byte untouched.
 *
 * A bare `&` is also a separator (backgrounding), but `&` is also used in
 * redirects (`2>&1`, `>&2`, `&>out.log`) where it is NOT a separator — those
 * are skipped by checking the adjacent characters. This is best-effort (it
 * doesn't understand `()` subshell grouping or unquoted command
 * substitution), matching the same conservative tradeoff as
 * `stripEmbeddedText`: a missed optimization is harmless, a wrongly-placed
 * flag isn't.
 */
function splitTopLevel(skeleton: string): Segment[] {
  const segments: Segment[] = []
  let start = 0
  let i = 0
  while (i < skeleton.length) {
    const two = skeleton.slice(i, i + 2)
    if (two === "&&" || two === "||") {
      segments.push({ start, end: i })
      i += 2
      start = i
      continue
    }
    const ch = skeleton[i]
    if (ch === ";" || ch === "|") {
      segments.push({ start, end: i })
      i += 1
      start = i
      continue
    }
    if (ch === "&") {
      const prev = skeleton[i - 1]
      const next = skeleton[i + 1]
      if (prev !== ">" && prev !== "<" && next !== ">") {
        segments.push({ start, end: i })
        i += 1
        start = i
        continue
      }
    }
    i += 1
  }
  segments.push({ start, end: skeleton.length })
  return segments
}

/**
 * Blanks out quoted strings and heredoc bodies, leaving only actual shell
 * syntax for the pattern checks below. Without this, a command like
 * `git commit -m "fixed the npm install bug"` — or worse, a heredoc-based
 * commit message that happens to mention a tool name in prose — gets
 * mistaken for an actual npm invocation and rewritten, corrupting the
 * commit message. Best-effort (doesn't handle every shell quoting edge
 * case), but a missed optimization is harmless while a corrupted command
 * isn't — same tradeoff as hasShellChaining above.
 */
function stripEmbeddedText(command: string): string {
  let skeleton = command
  // Heredoc body: <<'EOF' ... \nEOF (handles quoted/unquoted/<<- delimiters).
  skeleton = skeleton.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\s*\2\b/g, (m) => " ".repeat(m.length))
  // Double- and single-quoted strings (basic backslash-escape handling, no nesting).
  skeleton = skeleton.replace(/"(?:[^"\\]|\\.)*"/g, (m) => " ".repeat(m.length))
  skeleton = skeleton.replace(/'(?:[^'\\]|\\.)*'/g, (m) => " ".repeat(m.length))
  return skeleton
}

interface SegmentMatch {
  command: string
  label: string
}

/** Tries every quiet-flag pattern against a single (already chain-split) segment. */
function matchQuietPattern(segmentSkeleton: string, segment: string): SegmentMatch | null {
  let next = segment
  let label: string | undefined

  if (
    /\bnpm\s+(run\s+)?test\b/.test(segmentSkeleton) &&
    !hasFlag(segment, ["--silent", "--quiet", "--loglevel silent"])
  ) {
    next = appendFlag(segment, "--silent")
    label = "npm_test"
  } else if (/\bnpm\s+(run\s+)?build\b/.test(segmentSkeleton) && !hasFlag(segment, ["--loglevel", "--silent"])) {
    next = appendFlag(segment, "--loglevel=warn")
    label = "npm_build"
  } else if (/\bpnpm\s+test\b/.test(segmentSkeleton) && !hasFlag(segment, ["--reporter=dot", "--silent"])) {
    next = appendFlag(segment, "--reporter=dot")
    label = "npm_test"
  } else if (/\byarn\s+test\b/.test(segmentSkeleton) && !hasFlag(segment, ["--silent"])) {
    next = appendFlag(segment, "--silent")
    label = "npm_test"
  } else if (/\bcargo\s+test\b/.test(segmentSkeleton) && !hasFlag(segment, ["--quiet", "-q"])) {
    next = appendFlag(segment, "--quiet")
    label = "cargo_test"
  } else if (/\bcargo\s+(build|run|check|bench)\b/.test(segmentSkeleton) && !hasFlag(segment, ["--quiet", "-q"])) {
    next = appendFlag(segment, "--quiet")
    label = "cargo_build"
  } else if (
    /\bdotnet\s+(build|test|restore|publish)\b/.test(segmentSkeleton) &&
    !hasFlag(segment, ["--verbosity", "-v"])
  ) {
    next = appendFlag(segment, "--verbosity quiet")
    label = "dotnet"
  } else if (/\bpytest\b/.test(segmentSkeleton) && !hasFlag(segment, ["-q", "--quiet", "-v"])) {
    next = appendFlag(segment, "-q")
    label = "pytest"
  } else if (/\bpython\s+-m\s+pytest\b/.test(segmentSkeleton) && !hasFlag(segment, ["-q", "--quiet"])) {
    next = appendFlag(segment, "-q")
    label = "pytest"
  } else if (/\bnpm\s+(install|ci)\b/.test(segmentSkeleton) && !hasFlag(segment, ["--loglevel", "--silent"])) {
    next = appendFlag(segment, "--loglevel=warn")
    label = "npm_install"
  } else if (/\b(pip|pip3)\s+install\b/.test(segmentSkeleton) && !hasFlag(segment, ["-q", "--quiet", "-v"])) {
    next = appendFlag(segment, "-q")
    label = "pip_install"
  } else if (/\bcomposer\s+(install|update)\b/.test(segmentSkeleton) && !hasFlag(segment, ["--quiet", "-v"])) {
    next = appendFlag(segment, "--quiet")
    label = "composer_install"
  } else if (/\bbundle\s+install\b/.test(segmentSkeleton) && !hasFlag(segment, ["--quiet", "-v"])) {
    next = appendFlag(segment, "--quiet")
    label = "bundle_install"
  } else if (
    /\b(mvn|mvnw)(\.cmd|\.bat)?\s+\S/i.test(segmentSkeleton) &&
    !hasFlag(segment, ["-q", "--quiet", "-X", "--debug", "-v"])
  ) {
    next = appendFlag(segment, "-q")
    label = "maven"
  } else if (
    /\b(gradle|gradlew)(\.bat)?\s+\S/i.test(segmentSkeleton) &&
    !hasFlag(segment, ["-q", "--quiet", "--debug", "-v"])
  ) {
    next = appendFlag(segment, "-q")
    label = "gradle"
  } else if (/\bmake\s+\w/.test(segmentSkeleton) && !hasFlag(segment, ["-s", "--silent"])) {
    next = appendFlag(segment, "-s")
    label = "make"
  } else if (/\bvite\s+build\b/.test(segmentSkeleton) && !hasFlag(segment, ["--logLevel", "--debug"])) {
    next = appendFlag(segment, "--logLevel warn")
    label = "vite_build"
  } else if (/\bdocker(\s+compose)?\s+logs\b/.test(segmentSkeleton) && !hasFlag(segment, ["--tail", "-n"])) {
    next = appendFlag(segment, "--tail=80")
    label = "docker_logs"
  } else if (/\bcurl\b/.test(segmentSkeleton) && !hasFlag(segment, ["-s", "--silent", "-S"])) {
    next = appendFlag(segment, "-sS")
    label = "curl"
  }

  if (label === undefined || next === segment) {
    return null
  }
  return { command: next, label }
}

/**
 * Rewrite bash commands to emit less noise before execution. Splits on
 * top-level shell operators first so a command like
 * `cd app && npm test | tail -15` gets `npm test` rewritten in place without
 * touching `cd app` or `tail -15`.
 */
export function optimizeBashCommand(command: string): PrecallResult {
  const base = { args: { command }, modified: false, blocked: false, estimatedTokensSaved: 0 }

  if (!command.trim()) {
    return base
  }

  const skeleton = stripEmbeddedText(command)
  const segments = splitTopLevel(skeleton)

  let rebuilt = ""
  let cursor = 0
  let totalSaved = 0
  const labels: string[] = []

  for (const { start, end } of segments) {
    rebuilt += command.slice(cursor, start)
    const segmentText = command.slice(start, end)
    const match = matchQuietPattern(skeleton.slice(start, end), segmentText)
    if (match) {
      rebuilt += match.command
      totalSaved += PRECALL_ESTIMATES[match.label] ?? PRECALL_ESTIMATES.generic_quiet ?? 300
      labels.push(match.label)
    } else {
      rebuilt += segmentText
    }
    cursor = end
  }
  rebuilt += command.slice(cursor)

  if (labels.length === 0) {
    return base
  }

  return {
    args: { command: rebuilt },
    modified: true,
    blocked: false,
    estimatedTokensSaved: totalSaved,
    label: labels.join(","),
  }
}

const BLOCKED_READ_PATTERNS = [
  /node_modules\//,
  /\.git\//,
  /\/dist\//,
  /\/build\//,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.min\.js$/,
]

/**
 * Block reads of paths that rarely help the agent and waste context.
 */
export function optimizeReadPath(path: string): PrecallResult {
  const normalized = path.replace(/\\/g, "/")
  for (const pattern of BLOCKED_READ_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        args: { path },
        modified: false,
        blocked: true,
        blockReason: `Blocked read of low-signal path: ${path}`,
        estimatedTokensSaved: 2000,
      }
    }
  }
  return { args: { path }, modified: false, blocked: false, estimatedTokensSaved: 0 }
}

/**
 * Optimize tool args before execution (pre-call / input side).
 */
export function optimizeToolArgs(tool: string, args: Record<string, unknown>): PrecallResult {
  if (tool === "bash" && typeof args.command === "string") {
    return optimizeBashCommand(args.command)
  }

  const readPath =
    typeof args.path === "string"
      ? args.path
      : typeof args.filePath === "string"
        ? args.filePath
        : typeof args.file_path === "string"
          ? args.file_path
          : null

  if ((tool === "read" || tool === "glob") && readPath) {
    return optimizeReadPath(readPath)
  }

  return { args, modified: false, blocked: false, estimatedTokensSaved: 0 }
}
