import type { Outcome } from '../settle'

/** The symbols on a reel. */
export type Symbol = 'pass' | 'fail' | 'cash' | 'seven' | 'bar'

/** What each symbol is drawn with: three rows of block art and the palette tone they take on the payline. */
export const TILES: Readonly<Record<Symbol, { tone: 'up' | 'down' | 'gold' | 'house' | 'muted'; art: readonly [string, string, string] }>> = {
  pass: { tone: 'up', art: ['     ▄█', '█▄  ▄█▀', ' ▀██▀  '] },
  fail: { tone: 'down', art: ['█▄   ▄█', ' ▀█▄█▀ ', '▄█▀ ▀█▄'] },
  cash: { tone: 'gold', art: ['▄█▀█▀▀ ', '▀▀█▀█▄ ', '▄▄█▄█▀ '] },
  seven: { tone: 'house', art: ['▀▀▀▀▀█▀', '   ▄█▀ ', '  ██   '] },
  bar: { tone: 'muted', art: ['▄▄▄▄▄▄▄', '█ BAR █', '▀▀▀▀▀▀▀'] },
}

/** The reel strip, top to bottom: each symbol is three rows of art and one blank row. */
export const STRIP: readonly Symbol[] = ['pass', 'seven', 'fail', 'cash', 'bar', 'fail', 'pass', 'cash', 'seven', 'bar']

export const TILE_ROWS = 4

/** Rows a reel's window shows, and which of them are the payline. */
export const WINDOW_ROWS = 7
const PAYLINE = [2, 3, 4]

/** What a void run's reels stop on: no three of a kind, and no pass or fail on the line. */
const VOID_STOPS: readonly [Symbol, Symbol, Symbol] = ['bar', 'cash', 'seven']

/** Where each reel starts on the strip, so the three do not spin in step. */
const STARTS = [0, 13, 27]

/** How long a spinning reel takes to roll one row. */
export const SPIN_MS = 35

/** How long each reel waits after the one to its left before it starts to stop. */
export const STOP_STAGGER_MS = 280

/** How long each reel takes to stop: the third is the slowest, the near miss. */
export const STOP_MS: readonly number[] = [360, 460, 640]

/** How long the third reel holds the symbol before the result on the payline: the near miss. */
export const NEAR_MISS_HOLD_MS = 280

/** How long the third reel then takes to roll its last tile onto the result. */
export const NEAR_MISS_ROLL_MS = 300

/** The fewest rows a stopping reel rolls before it lands. */
const LEAST_TRAVEL = 24

/** When the tally's payout starts to roll, and how long each digit takes to land. */
export const ROLL_AT_MS = 500
export const DIGIT_MS = 180

/** The most coins the pile grows to, and the payout each coin stands for. */
export const PILE_MOST = 24
const PER_COIN = 12

/** One row of the strip: the symbol it belongs to and its art, blank on a symbol's fourth row. */
export function stripRowOf(row: number): { symbol: Symbol; art: string } {
  const length = STRIP.length * TILE_ROWS
  const at = ((row % length) + length) % length
  const symbol = STRIP[Math.floor(at / TILE_ROWS)] ?? 'pass'
  const line = at % TILE_ROWS

  return { symbol, art: line === 3 ? ' '.repeat(7) : TILES[symbol].art[line] ?? '' }
}

/** A reel's window at `offset`: seven rows, the payline marked. */
export function windowOf(offset: number): { symbol: Symbol; art: string; isPayline: boolean }[] {
  return Array.from({ length: WINDOW_ROWS }, (_, row) => ({ ...stripRowOf(offset + row), isPayline: PAYLINE.includes(row) }))
}

/** The offset that lands `symbol` on the payline, `spins` times round the strip. */
export function stopOffsetOf(symbol: Symbol, spins: number): number {
  return (STRIP.indexOf(symbol) + spins * STRIP.length) * TILE_ROWS - (PAYLINE[0] ?? 0)
}

/** What the reels stop on for a settled run. Decided by the outcome alone: the reels decide nothing. */
export function stopsOf(outcome: Outcome): [Symbol, Symbol, Symbol] {
  if (outcome === 'void') {
    return [...VOID_STOPS]
  }

  return [outcome, outcome, outcome]
}

/** The symbols on the payline's middle row. */
export function paylineOf(offsets: readonly number[]): Symbol[] {
  return offsets.map(offset => stripRowOf(offset + (PAYLINE[1] ?? 3)).symbol)
}

/** When the last reel has landed, for a run settled at `settledAt`. */
export function stoppedAt(settledAt: number): number {
  return settledAt + 2 * STOP_STAGGER_MS + (STOP_MS[2] ?? 0) + NEAR_MISS_HOLD_MS + NEAR_MISS_ROLL_MS
}

/**
 * Each reel's offset at `time`: spinning until the run settles, then each one
 * in turn easing out onto the outcome's symbol and holding there. The third
 * reel eases out one tile short, holds the wrong symbol on the payline, then
 * rolls that last tile onto the result.
 */
export function offsetsAt(time: number, settledAt: number | null, outcome: Outcome | null): number[] {
  const spinOf = (reel: number, at: number) => (STARTS[reel] ?? 0) + Math.floor(at / SPIN_MS)
  if (settledAt === null || outcome === null) {
    return STARTS.map((_, reel) => spinOf(reel, time))
  }

  const stops = stopsOf(outcome)

  return STARTS.map((_, reel) => {
    const begins = settledAt + reel * STOP_STAGGER_MS
    if (time < begins) {
      return spinOf(reel, time)
    }

    const from = spinOf(reel, begins)
    const symbol = stops[reel] ?? 'bar'
    let spins = 0
    while (stopOffsetOf(symbol, spins) < from + LEAST_TRAVEL) {
      spins += 1
    }
    const isTease = reel === STARTS.length - 1
    const to = stopOffsetOf(symbol, spins)
    const short = isTease ? to - TILE_ROWS : to
    const progress = Math.min(1, (time - begins) / (STOP_MS[reel] ?? 1))
    const eased = Math.round(from + (short - from) * (1 - (1 - progress) ** 3))
    const rollsAt = begins + (STOP_MS[reel] ?? 0) + NEAR_MISS_HOLD_MS
    if (!isTease || time < rollsAt) {
      return eased
    }
    const rolled = Math.min(1, (time - rollsAt) / NEAR_MISS_ROLL_MS)

    return short + Math.round(TILE_ROWS * rolled * rolled * (3 - 2 * rolled))
  })
}

/** The tally's payout `time` into the tally: digits land left to right, the rest still rolling. */
export function rolledOf(amount: number, time: number): string {
  const tick = Math.floor(time / 40)

  return [...String(amount)]
    .map((digit, index) => (time >= ROLL_AT_MS + (index + 1) * DIGIT_MS ? digit : String((tick * 7 + index * 3) % 10)))
    .join('')
}

/** How many coins a payout piles up. */
export function pileOf(paid: number): number {
  return Math.min(PILE_MOST, Math.ceil(paid / PER_COIN))
}
