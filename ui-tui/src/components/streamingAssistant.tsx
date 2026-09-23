import { useStore } from '@nanostores/react'
import { memo } from 'react'

import type { AppLayoutProgressProps } from '../app/interfaces.js'
import { toggleTodoCollapsed, useTurnSelector } from '../app/turnStore.js'
import { $uiState } from '../app/uiStore.js'
import { blockRenders } from '../domain/blockLayout.js'
import { sectionMode } from '../domain/details.js'
import { appendToolShelfMessage } from '../lib/liveProgress.js'
import type { ActiveTool, DetailsMode, Msg, SectionVisibility } from '../types.js'

import { MessageLine } from './messageLine.js'
import { LiveCompactionLine, LivePrefillLine } from './thinking.js'
import { TodoPanel } from './todoPanel.js'

const groupedSegments = (segments: Msg[]): Msg[] =>
  segments.reduce<Msg[]>((acc, msg) => appendToolShelfMessage(acc, msg), [])

interface LiveBlock {
  isStreaming?: boolean
  key: string
  msg: Msg
  tools?: ActiveTool[]
}

export const StreamingAssistant = memo(function StreamingAssistant({
  cols,
  compact,
  detailsMode,
  detailsModeCommandOverride,
  prevMsg,
  progress,
  sections
}: StreamingAssistantProps) {
  const ui = useStore($uiState)
  const generationTiming = ui.generationTiming
  const streamSegments = useTurnSelector(state => state.streamSegments)
  const streamPendingTools = useTurnSelector(state => state.streamPendingTools)
  const streamTiming = useTurnSelector(state => state.streamTiming)
  const streaming = useTurnSelector(state => state.streaming)
  const activeTools = useTurnSelector(state => state.tools)
  const toolGenDurationMs = useTurnSelector(state => state.toolGenDurationMs)
  const toolGenTokens = useTurnSelector(state => state.toolGenTokens)
  const prefillStartMs = useTurnSelector(state => state.prefillStartMs)
  const compactionStartMs = useTurnSelector(state => state.compactionStartMs)
  const showStreamingArea = Boolean(streaming)
  // Live ↑ ticker for the whole prefill phase: shown whenever the clock is
  // armed (submitted / tool result sent, no real token yet) and unmounts the
  // instant the first token consumes it. NOT gated on "no segments" — the
  // thinking.delta status text creates a segment right after submit, so the
  // ticker must stay up as long as the prefill clock is armed. Gated on
  // `display.generation_timing` — with the flag off the clocks never show.
  const showPrefillTicker = generationTiming && prefillStartMs !== null
  // Live compaction line: shown while a context summarization is in
  // progress. The prefill clock is paused during compaction (prefillStartMs
  // is null), so it never competes with the ↑ ticker.
  const showCompactionLine = generationTiming && compactionStartMs !== null
  // When a live reasoning segment exists AND its header will actually paint,
  // the thinking header hosts the ↑ prefill clock itself (live during
  // prefill, frozen once the first token lands), so the separate bottom
  // ticker would be a duplicate "Thinking" label in a second place.
  // Suppress it in that case; keep it as the fallback when there's no
  // thinking header to host the clock (e.g. thinking hidden via /details).
  const visibleThinking = sectionMode('thinking', detailsMode, sections, detailsModeCommandOverride) !== 'hidden'
  const hasLiveThinking = visibleThinking && streamSegments.some(msg => msg.isLiveReasoning === true)

  if (!progress.showProgressArea && !showStreamingArea && !activeTools.length && !showPrefillTicker && !showCompactionLine) {
    return null
  }

  // Flatten the live area into one ordered list so each block's leading gap
  // can be derived from the block directly above it — including the boundary
  // back into settled history (prevMsg). Tracking the predecessor rather than
  // the live text is what keeps the streaming block from jumping when it
  // flushes into a settled segment.
  const blocks: LiveBlock[] = groupedSegments(streamSegments).map((msg, i) => ({ key: `seg:${i}`, msg }))

  if (activeTools.length) {
    blocks.push({
      key: 'active-tools',
      msg: {
        kind: 'trail',
        role: 'system',
        text: '',
        ...(toolGenDurationMs !== null ? { toolGenDurationMs } : {}),
        ...(toolGenTokens > 0 ? { toolGenTokens } : {})
      },
      tools: activeTools
    })
  }

  if (showStreamingArea) {
    blocks.push({
      isStreaming: true,
      key: 'streaming',
      msg: {
        role: 'assistant',
        text: streaming,
        ...(streamTiming?.prefillMs !== undefined && { textPrefillMs: streamTiming.prefillMs }),
        ...(streamTiming?.decodeMs !== undefined && { textDurationMs: streamTiming.decodeMs }),
        ...(streamPendingTools.length && { tools: streamPendingTools })
      }
    })
  } else if (streamPendingTools.length) {
    blocks.push({ key: 'pending-tools', msg: { kind: 'trail', role: 'system', text: '', tools: streamPendingTools } })
  }

  const detailsCtx = { commandOverride: detailsModeCommandOverride, detailsMode, sections }
  let prev = prevMsg

  return (
    <>
      {blocks.map(block => {
        const node = (
          <MessageLine
            cols={cols}
            compact={compact}
            detailsMode={detailsMode}
            detailsModeCommandOverride={detailsModeCommandOverride}
            generationTiming={generationTiming}
            isStreaming={block.isStreaming}
            key={block.key}
            liveDetails
            {...(block.msg.isLiveReasoning === true && prefillStartMs !== null
              ? { livePrefillStartMs: prefillStartMs }
              : {})}
            msg={block.msg}
            prev={prev}
            reasoningActive={block.msg.isLiveReasoning === true}
            sections={sections}
            t={ui.theme}
            {...(block.tools ? { tools: block.tools } : {})}
          />
        )

        // Advance the grouping predecessor only past blocks that actually
        // paint, so a trail hidden by /details stays transparent here too
        // (active tools live in the prop, so fold them into the check).
        const checkMsg = block.tools?.length ? { ...block.msg, tools: block.tools.map(tool => tool.name) } : block.msg

        if (blockRenders(checkMsg, detailsCtx)) {
          prev = block.msg
        }

        return node
      })}

      {showCompactionLine && compactionStartMs !== null ? (
        <LiveCompactionLine startMs={compactionStartMs} t={ui.theme} />
      ) : null}

      {showPrefillTicker && prefillStartMs !== null && !hasLiveThinking ? (
        <LivePrefillLine startMs={prefillStartMs} t={ui.theme} />
      ) : null}
    </>
  )
})

export const LiveTodoPanel = memo(function LiveTodoPanel() {
  const ui = useStore($uiState)
  const todos = useTurnSelector(state => state.todos)
  const collapsed = useTurnSelector(state => state.todoCollapsed)

  return <TodoPanel collapsed={collapsed} onToggle={toggleTodoCollapsed} t={ui.theme} todos={todos} />
})

interface StreamingAssistantProps {
  cols: number
  compact?: boolean
  detailsMode: DetailsMode
  detailsModeCommandOverride: boolean
  prevMsg?: Msg
  progress: AppLayoutProgressProps
  sections?: SectionVisibility
}
