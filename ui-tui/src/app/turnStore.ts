import { atom } from 'nanostores'
import { useSyncExternalStore } from 'react'

import { isTodoDone } from '../lib/liveProgress.js'
import type { ActiveTool, ActivityItem, Msg, SubagentProgress, TodoItem } from '../types.js'

const buildTurnState = (): TurnState => ({
  activity: [],
  outcome: '',
  reasoning: '',
  reasoningActive: false,
  reasoningStreaming: false,
  reasoningTokens: 0,
  streamPendingTools: [],
  streamSegments: [],
  streamTiming: null,
  // Live prefill (time-to-first-token) clock: set at submit, cleared when the
  // first delta arrives. The Thinking header ticks ↑ against this during the
  // wait so the user sees the prefill counting up from the moment of enter.
  prefillStartMs: null,
  streaming: '',
  subagents: [],
  todoCollapsed: false,
  todos: [],
  toolTokens: 0,
  toolGenDurationMs: null,
  toolGenTokens: 0,
  compactionStartMs: null,
  tools: [],
  turnTrail: []
})

export const $turnState = atom<TurnState>(buildTurnState())

export const getTurnState = () => $turnState.get()

const subscribeTurn = (cb: () => void) => $turnState.listen(() => cb())

export const useTurnSelector = <T>(selector: (state: TurnState) => T): T =>
  useSyncExternalStore(
    subscribeTurn,
    () => selector($turnState.get()),
    () => selector($turnState.get())
  )

export const patchTurnState = (next: Partial<TurnState> | ((state: TurnState) => TurnState)) =>
  $turnState.set(typeof next === 'function' ? next($turnState.get()) : { ...$turnState.get(), ...next })

export const toggleTodoCollapsed = () => patchTurnState(state => ({ ...state, todoCollapsed: !state.todoCollapsed }))

export const archiveDoneTodos = () => archiveTodosAtTurnEnd()

export const archiveTodosAtTurnEnd = () => {
  const state = $turnState.get()

  if (!state.todos.length) {
    return []
  }

  const done = isTodoDone(state.todos)

  const msg: Msg = {
    kind: 'trail',
    role: 'system',
    text: '',
    todos: state.todos,
    ...(done ? { todoCollapsedByDefault: true } : { todoIncomplete: true })
  }

  patchTurnState({ todoCollapsed: false, todos: [] })

  return [msg]
}

export const resetTurnState = () => $turnState.set(buildTurnState())

export interface TurnState {
  activity: ActivityItem[]
  outcome: string
  reasoning: string
  reasoningActive: boolean
  reasoningStreaming: boolean
  reasoningTokens: number
  streamPendingTools: string[]
  streamSegments: Msg[]
  // Live generation timing for the in-flight text block, patched on each
  // stream batch tick so duration / token speed update in realtime.
  streamTiming: { decodeMs?: number; prefillMs?: number } | null
  // Live prefill clock (see initial state). Non-null while waiting for the
  // first token of the current model call.
  prefillStartMs: number | null
  streaming: string
  subagents: SubagentProgress[]
  todoCollapsed: boolean
  todos: TodoItem[]
  toolTokens: number
  toolGenDurationMs: number | null
  toolGenTokens: number
  compactionStartMs: number | null
  tools: ActiveTool[]
  turnTrail: string[]
}
