/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal, onCleanup, Show } from "solid-js"
import { StatsStore, buildStatsBreakdown, formatTokenCount } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

const id = "@ctxlite/opencode"
const SIDEBAR_ORDER = 200
const REFRESH_INTERVAL_MS = 15_000

interface StatsSnapshot {
  totalLine: string
  rows: string[]
}

function readSnapshot(): StatsSnapshot {
  let store: StatsStore | null = null
  try {
    store = new StatsStore(getStatsDbPath())
    const summary = store.summary(0)
    if (summary.totalRequests === 0) {
      return { totalLine: "no savings yet", rows: [] }
    }

    const rows = buildStatsBreakdown(summary)
      .filter((row) => row.tokensSaved > 0)
      .map((row) => `${row.label.padEnd(9)} ${formatTokenCount(row.tokensSaved).padStart(6)}`)

    return { totalLine: `${formatTokenCount(summary.tokensSaved)} saved`, rows }
  } catch {
    return { totalLine: "", rows: [] }
  } finally {
    store?.close()
  }
}

function SidebarStats(props: { api: TuiPluginApi }) {
  const [snapshot, setSnapshot] = createSignal<StatsSnapshot>(readSnapshot())

  const interval = setInterval(() => setSnapshot(readSnapshot()), REFRESH_INTERVAL_MS)
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
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content() {
        return <SidebarStats api={api} />
      },
    },
  })
}

const pluginModule: TuiPluginModule & { id: string } = { id, tui }

export default pluginModule
