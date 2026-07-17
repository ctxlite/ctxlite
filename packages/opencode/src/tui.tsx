/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { StatsStore } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"
import { buildOpenCodeSessionDisplay, type OpenCodeSessionDisplay } from "./session-display.js"

const id = "@ctxlite/opencode"
const SIDEBAR_ORDER = 200
const REFRESH_INTERVAL_MS = 15_000

/** Current session only, not all-time — the sidebar should reflect what this session has saved, not an ever-growing total. */
function readSnapshot(sessionID: string): OpenCodeSessionDisplay {
  let store: StatsStore | null = null
  try {
    store = new StatsStore(getStatsDbPath())
    return buildOpenCodeSessionDisplay(store.summaryForSession("opencode", sessionID))
  } catch {
    return {
      totalLine: "",
      breakdownRows: [],
      costLine: null,
      hasBaseline: false,
      supportLabel: "",
      supportUrl: "",
      tokensSaved: 0,
    }
  } finally {
    store?.close()
  }
}

function SidebarStats(props: { api: TuiPluginApi; sessionID: string }) {
  const [snapshot, setSnapshot] = createSignal<OpenCodeSessionDisplay>(readSnapshot(props.sessionID))

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
          {snapshot().breakdownRows.map((line) => (
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
        <Show when={snapshot().supportLabel}>
          <text fg={props.api.theme.current.textMuted} wrapMode="none">
            ♥ {snapshot().supportLabel}
          </text>
          <text fg={props.api.theme.current.textMuted} wrapMode="none">
            {snapshot().supportUrl}
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
