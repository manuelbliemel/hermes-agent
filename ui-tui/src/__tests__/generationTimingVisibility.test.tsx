// display.generation_timing gating contract: the ↑ prefill / ↓ decode /
// tok/s output on the thinking and Tool-calls headers only paints when
// the flag is on. Token counts predate the timing feature and must keep
// showing either way.
import { PassThrough } from 'stream'

import { renderSync } from '@hermes/ink'
import { stripAnsi } from '@hermes/shared/ansi'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { ToolTrail } from '../components/thinking.js'
import { DEFAULT_THEME } from '../theme.js'

const flushEffects = async () => {
  // Passive effects + the re-render they trigger need a few macrotask
  // turns (React's scheduler uses MessageChannel) before the next frame
  // paints — setTimeout(0)-class waits, not setImmediate.
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const mountTrail = (props: Record<string, unknown>) => {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()
  let output = ''

  Object.assign(stdout, { columns: 80, isTTY: false, rows: 20 })
  Object.assign(stdin, { isTTY: false })
  Object.assign(stderr, { isTTY: false })
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const instance = renderSync(<ToolTrail t={DEFAULT_THEME} {...(props as any)} />, {
    patchConsole: false,
    stderr: stderr as NodeJS.WriteStream,
    stdin: stdin as NodeJS.ReadStream,
    stdout: stdout as NodeJS.WriteStream
  })

  return { output: () => stripAnsi(output), instance }
}

const timingProps = {
  reasoning: 'Some reasoning text.',
  reasoningTokens: 120,
  thinkingDurationMs: 4200,
  thinkingPrefillMs: 800,
  thinkingPrefillNewTokens: 3000,
  toolGenTokens: 95,
  toolGenDurationMs: 2100
}

// The tool-arg label is the "Tool calls" header suffix — the header only
// paints when there are active tools to group.
const withTool = { tools: [{ id: 't1', name: 'terminal', status: 'running' }] as any }

describe('ToolTrail — display.generation_timing gate', () => {
  it('hides ↑ prefill / ↓ decode / tok/s when the flag is off', async () => {
    const { instance, output } = mountTrail({ ...timingProps, sections: { thinking: 'expanded', tools: 'expanded' } })
    await flushEffects()
    const out = output()

    expect(out).not.toMatch('↑')
    expect(out).not.toMatch('↓')
    expect(out).not.toMatch('tok/s')
    // Token counts are NOT gated — they predate the timing feature.
    expect(out).toContain('~120 tokens')
    instance.unmount()
  })

  it('shows ↑ prefill / ↓ decode / tok/s when the flag is on', async () => {
    const { instance, output } = mountTrail({
      ...timingProps,
      generationTiming: true,
      sections: { thinking: 'expanded', tools: 'expanded' }
    })

    await flushEffects()
    const out = output()

    expect(out).toMatch('↑')
    expect(out).toMatch('↓')
    expect(out).toMatch('tok/s')
    instance.unmount()
  })

  it('keeps the bare tool-arg token count with the flag off, adds the rate with it on', async () => {
    const off = mountTrail({ ...timingProps, ...withTool, sections: { thinking: 'expanded', tools: 'expanded' } })
    await flushEffects()
    expect(off.output()).toContain('~95 tok')
    expect(off.output()).not.toMatch(/~95 tok · ↓/)
    off.instance.unmount()

    const on = mountTrail({
      ...timingProps,
      ...withTool,
      generationTiming: true,
      sections: { thinking: 'expanded', tools: 'expanded' }
    })

    await flushEffects()
    expect(on.output()).toContain('~95 tok')
    expect(on.output()).toMatch(/~95 tok · ↓/)
    on.instance.unmount()
  })
})
