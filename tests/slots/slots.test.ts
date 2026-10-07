import { describe, expect, test, tier } from 'claude-code/testing'

import Slots from '../../hooks/slots'
import type { Symbol } from '../../hooks/slots'

tier('user')

const OUTCOMES = ['pass', 'fail', 'void'] as const

describe('slots', () => {
  test('a stop offset puts the symbol on the payline: window rows 2 to 4 are its three rows of art', () => {
    for (const symbol of ['pass', 'fail', 'cash', 'seven', 'bar'] as Symbol[]) {
      const window = Slots.windowOf(Slots.stopOffsetOf(symbol, 3))

      expect(window.slice(2, 5).map(row => row.symbol), symbol).toEqual([symbol, symbol, symbol])
      expect(window.slice(2, 5).map(row => row.art), symbol).toEqual(Slots.TILES[symbol].art)
      expect(window.map(row => row.isPayline)).toEqual([false, false, true, true, true, false, false])
    }
  })

  test('the strip wraps both ways: a window is seven rows from any offset, negative ones too', () => {
    for (const offset of [-7, -1, 0, 3, 39, 40, 41, 1_000_003]) {
      expect(Slots.windowOf(offset).length, String(offset)).toBe(7)
    }
    // the strip is 10 tiles of 4 rows: offset 40 is offset 0 again
    expect(Slots.windowOf(40)).toEqual(Slots.windowOf(0))
    // one row back from 0 is the strip's last row, row 39: the bar's blank fourth row
    expect(Slots.windowOf(-1)[0]).toEqual({ ...Slots.windowOf(39)[0], isPayline: false })
    expect(Slots.stripRowOf(-1)).toEqual({ symbol: 'bar', art: '       ' })
  })

  test('the reels stop on the real result: three passes, three fails, or a mixed line for a void', () => {
    expect(Slots.stopsOf('pass')).toEqual(['pass', 'pass', 'pass'])
    expect(Slots.stopsOf('fail')).toEqual(['fail', 'fail', 'fail'])
    const voided = Slots.stopsOf('void')
    expect(new Set(voided).size, 'a void is never three of a kind').toBeGreaterThan(1)
    expect(voided.some(symbol => symbol === 'pass' || symbol === 'fail'), 'nor reads as a pass or a fail').toBe(false)
  })

  test('whenever the run settles, the stopped payline is the settled outcome, never anything else', () => {
    for (const outcome of OUTCOMES) {
      for (const settledAt of [0, 17, 35, 333, 1_234, 9_871, 60_013]) {
        const done = Slots.stoppedAt(settledAt)
        const payline = Slots.paylineOf(Slots.offsetsAt(done, settledAt, outcome))

        expect(payline, `${outcome} settled at ${settledAt}`).toEqual(Slots.stopsOf(outcome))
        expect(Slots.paylineOf(Slots.offsetsAt(done + 5_000, settledAt, outcome)), 'and stays there').toEqual(Slots.stopsOf(outcome))
      }
    }
  })

  test('before the run settles the reels keep spinning: every reel moves on with time', () => {
    const early = Slots.offsetsAt(1_000, null, null)
    const later = Slots.offsetsAt(1_700, null, null)

    expect(later.every((offset, reel) => offset > (early[reel] ?? 0))).toBe(true)
  })

  test('each reel keeps spinning until the one to its left has had its head start', () => {
    const settledAt = 2_000
    const justBefore = settledAt + Slots.STOP_STAGGER_MS - 1
    const spinning = Slots.offsetsAt(justBefore, null, null)
    const stopping = Slots.offsetsAt(justBefore, settledAt, 'pass')

    expect(stopping[0], 'the first reel is already easing off').not.toBe(spinning[0])
    expect(stopping.slice(1), 'the other two still spin as before').toEqual(spinning.slice(1))
  })

  test('the reels stop left to right, the third one last and slowest', () => {
    const settledAt = 2_000
    const stopped = (time: number) =>
      Slots.offsetsAt(time, settledAt, 'fail').map((offset, reel) => offset === Slots.offsetsAt(time + 400, settledAt, 'fail')[reel])

    // a moment after the first reel's stop: it holds still, the others still roll
    expect(stopped(settledAt + (Slots.STOP_MS[0] ?? 0) + 1)).toEqual([true, false, false])
    expect(stopped(settledAt + Slots.STOP_STAGGER_MS + (Slots.STOP_MS[1] ?? 0) + 1)).toEqual([true, true, false])
    expect(stopped(Slots.stoppedAt(settledAt))).toEqual([true, true, true])
    expect(Slots.STOP_MS[2] ?? 0).toBeGreaterThan(Slots.STOP_MS[1] ?? 0)
  })

  test('the third reel teases: it holds a wrong symbol on the payline, then rolls one tile onto the result', () => {
    for (const outcome of OUTCOMES) {
      const settledAt = 1_000
      const teaseFrom = settledAt + 2 * Slots.STOP_STAGGER_MS + (Slots.STOP_MS[2] ?? 0)
      const thirdAt = (time: number) => Slots.offsetsAt(time, settledAt, outcome)[2] ?? 0
      const shownAt = (time: number) => Slots.paylineOf(Slots.offsetsAt(time, settledAt, outcome))[2]

      expect(shownAt(teaseFrom), outcome).not.toBe(Slots.stopsOf(outcome)[2])
      expect(thirdAt(teaseFrom + Slots.NEAR_MISS_HOLD_MS - 1), 'held still on the wrong symbol').toBe(thirdAt(teaseFrom))
      expect(Slots.NEAR_MISS_HOLD_MS, 'long enough to read').toBeGreaterThanOrEqual(250)
      expect(thirdAt(Slots.stoppedAt(settledAt)) - thirdAt(teaseFrom), 'then one tile on').toBe(Slots.TILE_ROWS)
      expect(shownAt(Slots.stoppedAt(settledAt))).toBe(Slots.stopsOf(outcome)[2])
    }
  })

  test('a stopping reel only ever rolls forward, easing out', () => {
    const settledAt = 500
    // the third reel starts stopping two staggers after the run settles
    const begins = settledAt + 2 * Slots.STOP_STAGGER_MS
    let last = Slots.offsetsAt(begins, settledAt, 'pass')[2] ?? 0
    const steps: number[] = []
    for (let time = begins + 40; time <= Slots.stoppedAt(settledAt); time += 40) {
      const offset = Slots.offsetsAt(time, settledAt, 'pass')[2] ?? 0
      steps.push(offset - last)
      last = offset
    }

    expect(steps.every(step => step >= 0)).toBe(true)
    const moving = steps.filter(step => step > 0)
    expect(moving[0] ?? 0, 'fast at first, slow at the end').toBeGreaterThan(moving[moving.length - 1] ?? 0)
  })

  test('the tally rolls the payout in left to right, each digit landing in turn', () => {
    // 285 has three digits, one landing every DIGIT_MS once the roll starts
    const start = Slots.ROLL_AT_MS
    expect(Slots.rolledOf(285, start + Slots.DIGIT_MS)[0]).toBe('2')
    expect(Slots.rolledOf(285, start + 2 * Slots.DIGIT_MS).slice(0, 2)).toBe('28')
    expect(Slots.rolledOf(285, start + 3 * Slots.DIGIT_MS)).toBe('285')
    expect(Slots.rolledOf(285, start + 3 * Slots.DIGIT_MS).length).toBe(3)
    expect(Slots.rolledOf(285, 0)).toMatch(/^\d{3}$/)
  })

  test('the coin pile grows with the win: none for a loss, more for a bigger payout, never past the cap', () => {
    expect(Slots.pileOf(0)).toBe(0)
    // a coin per $12 paid, rounded up: 190 pays 16 coins, 285 pays 24
    expect(Slots.pileOf(190)).toBe(16)
    expect(Slots.pileOf(285)).toBe(24)
    expect(Slots.pileOf(5_000)).toBe(Slots.PILE_MOST)
  })
})
