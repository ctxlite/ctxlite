/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { StatsStore, buildStatsBreakdown, formatSavingsLine, renderStatsBarChart } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

const id = "@ctxlite/opencode"
const SIDEBAR_ORDER = 200
const REFRESH_INTERVAL_MS = 15_000

interface StatsSnapshot {
  totalLine: string
  rows: string[]
  costLine: string
}

/** Current session only, not all-time — the sidebar should reflect what this session has saved, not an ever-growing total. */
function readSnapshot(sessionID: string): StatsSnapshot {
  let store: StatsStore | null = null
  try {
    store = new StatsStore(getStatsDbPath())
    const summary = store.summaryForSession("opencode", sessionID)
    if (summary.totalRequests === 0) {
      return { totalLine: "no savings yet", rows: [], costLine: "" }
    }

    const rows = renderStatsBarChart(buildStatsBreakdown(summary))
    const totalLine = formatSavingsLine(summary)
    const costLine = `~$${summary.costSaved.toFixed(4)} saved`
    return { totalLine, rows, costLine }
  } catch {
    return { totalLine: "", rows: [], costLine: "" }
  } finally {
    store?.close()
  }
}

function SidebarStats(props: { api: TuiPluginApi; sessionID: string }) {
  const [snapshot, setSnapshot] = createSignal<StatsSnapshot>(readSnapshot(props.sessionID))

  // Re-reads immediately when the visible session changes (e.g. switching
  // chat tabs) — sessionID is a Solid prop, so this effect re-runs whenever
  // it does, not just on the polling interval below.
  createEffect(() => {
    setSnapshot(readSnapshot(props.sessionID))
  })

  const interval = setInterval(() => setSnapshot(readSnapshot(props.sessionID)), REFRESH_INTERVAL_MS)
  onCleanup(() => clearInterval(interval))

  return (
    <Show when={snapshot().totalLine}>
      <box gap={0}>
        <text fg={props.api.theme.current.text}>
          <b>ctxlite</b> · {snapshot().totalLine}
        </text>
        <box gap={0}>
          {snapshot().rows.map((line) => (
            <text fg={props.api.theme.current.textMuted} wrapMode="none">
              {line}
            </text>
          ))}
        </box>
        <Show when={snapshot().costLine}>
          <text fg={props.api.theme.current.textMuted} wrapMode="none">
            {snapshot().costLine}
          </text>
        </Show>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content(_ctx: TuiSlotContext, props: { session_id: string }) {
        return <SidebarStats api={api} sessionID={props.session_id} />
      },
    },
  })
}

const pluginModule: TuiPluginModule & { id: string } = { id, tui }

export default pluginModule
