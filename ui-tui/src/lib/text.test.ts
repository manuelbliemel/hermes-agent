import { describe, expect, it } from 'vitest'

import {
  clarifyBatchRevisitState,
  estimateTokensRough,
  fmtDecode,
  fmtGenDuration,
  fmtPrefill,
  fmtTokensPerSec,
  formatAbandonedClarify,
  formatAbandonedClarifyBatch,
  stripTrailingPasteNewlines
} from './text.js'

describe('stripTrailingPasteNewlines', () => {
  it('removes trailing newline runs from pasted text', () => {
    expect(stripTrailingPasteNewlines('alpha\n')).toBe('alpha')
    expect(stripTrailingPasteNewlines('alpha\nbeta\n\n')).toBe('alpha\nbeta')
  })

  it('preserves interior newlines', () => {
    expect(stripTrailingPasteNewlines('alpha\nbeta\ngamma')).toBe('alpha\nbeta\ngamma')
  })

  it('preserves newline-only pastes', () => {
    expect(stripTrailingPasteNewlines('\n\n')).toBe('\n\n')
  })
})

describe('formatAbandonedClarify', () => {
  it('renders the question, numbered options, and reason', () => {
    const out = formatAbandonedClarify('How do you want to scope?', ['Option A', 'Option B', 'Option C'], 'timed out')

    expect(out).toBe(
      [
        'ask How do you want to scope?',
        '  1. Option A',
        '  2. Option B',
        '  3. Option C',
        '  (timed out — no selection)'
      ].join('\n')
    )
  })

  it('handles a prompt with no choices (free-text clarify)', () => {
    const out = formatAbandonedClarify('What is the target branch?', null, 'cancelled')

    expect(out).toBe(['ask What is the target branch?', '  (cancelled — no selection)'].join('\n'))
  })

  it('trims surrounding whitespace on the question', () => {
    const out = formatAbandonedClarify('  trailing space  ', [], 'timed out')

    expect(out.split('\n')[0]).toBe('ask trailing space')
  })
})

describe('formatAbandonedClarifyBatch', () => {
  it('shows locked answers and marks unanswered questions', () => {
    const out = formatAbandonedClarifyBatch(
      [
        { qid: 'q0', question: 'One?' },
        { qid: 'q1', question: 'Two?' }
      ],
      { q0: 'alpha' },
      'timed out'
    )

    expect(out).toBe(['ask (2 questions)', '  ✓ One? → alpha', '  · Two? (no answer)', '  (timed out)'].join('\n'))
  })

  it('treats an empty locked answer as unanswered in the record', () => {
    const out = formatAbandonedClarifyBatch([{ qid: 'q0', question: 'One?' }], { q0: '' }, 'cancelled')

    expect(out).toContain('· One? (no answer)')
  })
})

describe('clarifyBatchRevisitState', () => {
  it('restores the cursor onto a choice answer', () => {
    expect(clarifyBatchRevisitState(['red', 'blue'], 'blue')).toEqual({ custom: '', sel: 1 })
  })

  it('stages a typed answer on the Other row for editing', () => {
    expect(clarifyBatchRevisitState(['red', 'blue'], 'chartreuse')).toEqual({ custom: 'chartreuse', sel: 2 })
  })

  it('stages a typed answer for an open-ended question (no choices)', () => {
    expect(clarifyBatchRevisitState([], 'free text')).toEqual({ custom: 'free text', sel: 0 })
  })

  it('resets cleanly for unanswered and empty answers', () => {
    expect(clarifyBatchRevisitState(['red'], undefined)).toEqual({ custom: '', sel: 0 })
    expect(clarifyBatchRevisitState(['red'], '')).toEqual({ custom: '', sel: 0 })
  })
})

describe('fmtGenDuration', () => {
  it('keeps one decimal under 10s so a snappy reply never reads 0s', () => {
    expect(fmtGenDuration(0)).toBe('0.0s')
    expect(fmtGenDuration(9_949)).toBe('9.9s')
  })

  it('switches to whole seconds from 10s up', () => {
    expect(fmtGenDuration(10_000)).toBe('10s')
    expect(fmtGenDuration(83_400)).toBe('83s')
  })

  it('clamps negative input to zero', () => {
    expect(fmtGenDuration(-500)).toBe('0.0s')
  })
})

describe('fmtTokensPerSec', () => {
  it('computes a rounded rate for blocks long enough to measure', () => {
    expect(fmtTokensPerSec(100, 2_000)).toBe('~50 tok/s')
    expect(fmtTokensPerSec(1_200, 8_400)).toBe('~143 tok/s')
  })

  it('suppresses the rate under ~500ms where batching jitter dominates', () => {
    expect(fmtTokensPerSec(50, 400)).toBeNull()
    expect(fmtTokensPerSec(50, 500)).toBeNull()
  })

  it('suppresses the rate without tokens', () => {
    expect(fmtTokensPerSec(0, 5_000)).toBeNull()
  })
})

describe('estimateTokensRough', () => {
  it('stays ~4 chars per token', () => {
    expect(estimateTokensRough('')).toBe(0)
    expect(estimateTokensRough('abcd')).toBe(1)
    expect(estimateTokensRough('a'.repeat(400))).toBe(100)
  })
})

describe('fmtPrefill', () => {
  it('labels the time-to-first-token with the up arrow', () => {
    expect(fmtPrefill(2_100)).toBe('↑ 2.1s prefill')
  })

  it('omits zero/undefined (no observable prefill)', () => {
    expect(fmtPrefill(0)).toBeNull()
    expect(fmtPrefill(undefined)).toBeNull()
  })

  it('carries the server-reported new-token count and derived rate', () => {
    expect(fmtPrefill(2_000, 12_345)).toBe('↑ 2.0s prefill · 12.3k new · ~6173 tok/s')
  })

  it('keeps the count but drops the rate below the jitter floor', () => {
    expect(fmtPrefill(300, 50)).toBe('↑ 0.3s prefill · 50 new')
  })

  it('stays bare without the server-reported count', () => {
    expect(fmtPrefill(2_100, undefined)).toBe('↑ 2.1s prefill')
  })
})

describe('fmtDecode', () => {
  it('labels decode time with throughput when measurable', () => {
    expect(fmtDecode(4_000, 200)).toBe('↓ 4.0s decode · ~50 tok/s')
  })

  it('drops the rate below the jitter floor but keeps the duration', () => {
    expect(fmtDecode(300, 10)).toBe('↓ 0.3s decode')
  })

  it('omits undefined entirely', () => {
    expect(fmtDecode(undefined, 100)).toBeNull()
  })
})
