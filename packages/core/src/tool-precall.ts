/** Heuristic tokens prevented by quieter command flags (conservative). */
const PRECALL_ESTIMATES: Record<string, number> = {
  npm_test: 800,
  npm_build: 400,
  npm_install: 300,
  cargo_test: 600,
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

/**
 * `&&`/`||`/`;`/`|` mean the matched command (e.g. "npm run build") isn't
 * necessarily the last thing in the string — appendFlag's "stick it on the
 * end" approach would then attach the flag to a DIFFERENT command instead
 * (e.g. `npm run build | tail -20` becoming `... | tail -20 --loglevel=warn`,
 * which breaks tail). Checking for any of these chars anywhere is
 * deliberately conservative — it also skips commands where the operator is
 * just inside a quoted string, but a missed optimization is harmless while
 * a wrongly-placed flag breaks the user's actual command.
 */
function hasShellChaining(skeleton: string): boolean {
  return /[|;&]/.test(skeleton)
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

/**
 * Rewrite bash commands to emit less noise before execution.
 */
export function optimizeBashCommand(command: string): PrecallResult {
  const base = { args: { command }, modified: false, blocked: false, estimatedTokensSaved: 0 }

  if (!command.trim()) {
    return base
  }

  const skeleton = stripEmbeddedText(command)
  if (hasShellChaining(skeleton)) {
    return base
  }

  let next = command
  let label: string | undefined

  if (/\bnpm\s+(run\s+)?test\b/.test(skeleton) && !hasFlag(next, ["--silent", "--quiet", "--loglevel silent"])) {
    next = appendFlag(next, "--silent")
    label = "npm_test"
  } else if (/\bnpm\s+(run\s+)?build\b/.test(skeleton) && !hasFlag(next, ["--loglevel", "--silent"])) {
    next = appendFlag(next, "--loglevel=warn")
    label = "npm_build"
  } else if (/\bpnpm\s+test\b/.test(skeleton) && !hasFlag(next, ["--reporter=dot", "--silent"])) {
    next = appendFlag(next, "--reporter=dot")
    label = "npm_test"
  } else if (/\byarn\s+test\b/.test(skeleton) && !hasFlag(next, ["--silent"])) {
    next = appendFlag(next, "--silent")
    label = "npm_test"
  } else if (/\bcargo\s+test\b/.test(skeleton) && !hasFlag(next, ["--quiet", "-q"])) {
    next = appendFlag(next, "--quiet")
    label = "cargo_test"
  } else if (/\bpytest\b/.test(skeleton) && !hasFlag(next, ["-q", "--quiet", "-v"])) {
    next = appendFlag(next, "-q")
    label = "pytest"
  } else if (/\bpython\s+-m\s+pytest\b/.test(skeleton) && !hasFlag(next, ["-q", "--quiet"])) {
    next = appendFlag(next, "-q")
    label = "pytest"
  } else if (/\bnpm\s+(install|ci)\b/.test(skeleton) && !hasFlag(next, ["--loglevel", "--silent"])) {
    next = appendFlag(next, "--loglevel=warn")
    label = "npm_install"
  } else if (/\b(pip|pip3)\s+install\b/.test(skeleton) && !hasFlag(next, ["-q", "--quiet", "-v"])) {
    next = appendFlag(next, "-q")
    label = "pip_install"
  } else if (/\bcomposer\s+(install|update)\b/.test(skeleton) && !hasFlag(next, ["--quiet", "-v"])) {
    next = appendFlag(next, "--quiet")
    label = "composer_install"
  } else if (/\bbundle\s+install\b/.test(skeleton) && !hasFlag(next, ["--quiet", "-v"])) {
    next = appendFlag(next, "--quiet")
    label = "bundle_install"
  } else if (/\bmvn\s+\w/.test(skeleton) && !hasFlag(next, ["-q", "--quiet", "-X", "--debug", "-v"])) {
    next = appendFlag(next, "-q")
    label = "maven"
  } else if (/(\bgradle|\.\/gradlew)\s+\w/.test(skeleton) && !hasFlag(next, ["-q", "--quiet", "--debug", "-v"])) {
    next = appendFlag(next, "-q")
    label = "gradle"
  } else if (/\bmake\s+\w/.test(skeleton) && !hasFlag(next, ["-s", "--silent"])) {
    next = appendFlag(next, "-s")
    label = "make"
  } else if (/\bvite\s+build\b/.test(skeleton) && !hasFlag(next, ["--logLevel", "--debug"])) {
    next = appendFlag(next, "--logLevel warn")
    label = "vite_build"
  } else if (/\bdocker(\s+compose)?\s+logs\b/.test(skeleton) && !hasFlag(next, ["--tail", "-n"])) {
    next = appendFlag(next, "--tail=80")
    label = "docker_logs"
  } else if (/\bcurl\b/.test(skeleton) && !hasFlag(next, ["-s", "--silent", "-S"])) {
    next = appendFlag(next, "-sS")
    label = "curl"
  }

  if (next === command) {
    return base
  }

  const estimateKey = label ?? "generic_quiet"
  return {
    args: { command: next },
    modified: true,
    blocked: false,
    estimatedTokensSaved: PRECALL_ESTIMATES[estimateKey] ?? PRECALL_ESTIMATES.generic_quiet ?? 300,
    label: estimateKey,
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
