import type { BenchLiveTask } from "../src/types.js"

/**
 * Representative task set for the live benchmark harness (spec 026, User
 * Story 3 / data-model.md Task Set entity). Deliberately small — this suite
 * makes real, billed-or-quota-consuming model calls, so it stays a
 * pre-release validation tool, not something run on every commit.
 */
export const TASKS: BenchLiveTask[] = [
  {
    taskId: "inspect-large-module-structure",
    prompt:
      "Without editing any files, list the exported functions from packages/core/src/tool-precall.ts and give a one-line description of what each does.",
    fixturePath: "packages/core/src/tool-precall.ts",
    expectedEditIntent: false,
    correctnessCheck:
      "Response names optimizeBashCommand, optimizeReadPath, and optimizeToolArgs (the module's actual exports).",
  },
  {
    taskId: "add-comment-to-large-module",
    prompt:
      "Add a one-line comment directly above the optimizeToolArgs function in packages/core/src/tool-precall.ts explaining what it does. Make only that one change.",
    fixturePath: "packages/core/src/tool-precall.ts",
    expectedEditIntent: true,
    correctnessCheck: "A one-line comment appears immediately above optimizeToolArgs, and no other code changed.",
  },
]
