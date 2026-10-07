import { SHADOW_FONT } from './font'

/** A stretch of one stamp row that is all solid block or all shadow edge. */
export type Run = { text: string; isShadow: boolean }

/** One bar's cells in one chart row, and what it is drawn as. */
export type Cell = { text: string; tone: 'up' | 'down' | 'rule' | 'blank' }

const EIGHTHS_ACROSS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const EIGHTHS_UP = ' ▁▂▃▄▅▆▇█'

/** How far below the lowest bar a chart's floor sits, as a share of the chart's range. */
const CHART_FLOOR = 0.15

/** How long one coin takes to fall, and how long each coin waits after the one before, as shares of the animation. */
const COIN_FALL = 0.5
const COIN_STAGGER = 0.04

/** Rows a coin falls through. */
export const COIN_ROWS = 4

/**
 * A word in ANSI Shadow letters, six rows. With `letters`, only the first that
 * many are drawn and the rest stay blank at their own width.
 */
export function stampRowsOf(word: string, letters = word.length): string[] {
  const glyphs = [...word].map(char => {
    const glyph = SHADOW_FONT[char]
    if (glyph === undefined) {
      throw new Error(`no stamp glyph for ${JSON.stringify(char)}`)
    }

    return glyph
  })

  return [0, 1, 2, 3, 4, 5].map(row =>
    glyphs
      .map((glyph, index) => (index < letters ? glyph[row] ?? '' : ' '.repeat(glyph[row]?.length ?? 0)))
      .join(''),
  )
}

/** A stamp row cut into runs of solid block and of shadow edge; a space has no color and joins the run it follows. */
export function runsOf(row: string): Run[] {
  const runs: Run[] = []
  for (const char of row) {
    const last = runs[runs.length - 1]
    const isShadow = char === ' ' ? last?.isShadow ?? false : char !== '█'
    if (last !== undefined && last.isShadow === isShadow) {
      last.text += char
    } else {
      runs.push({ text: char, isShadow })
    }
  }

  return runs
}

/** A gauge `cells` wide: full blocks, an eighth-block end, then a rule for the rest. */
export function gaugeOf(fraction: number, cells: number): { filled: string; rest: string } {
  const units = Math.round(Math.max(0, Math.min(1, fraction)) * cells * 8)
  const full = Math.floor(units / 8)
  const part = units % 8

  return { filled: '█'.repeat(full) + (EIGHTHS_ACROSS[part] ?? ''), rest: '─'.repeat(cells - full - (part > 0 ? 1 : 0)) }
}

/**
 * Bars `height` rows tall, two cells and a gap each, top row first. Bars rise
 * from a floor just below the lowest value, so none is empty; at or above
 * `start` they are `up`, below it `down`; the start's row is ruled where no bar is.
 */
export function chartOf(values: readonly number[], height: number, start: number): Cell[][] {
  const levelOf = levelsOf(values, height)
  const startRow = startRowOf(values, height, start)

  return Array.from({ length: height }, (_, index) => {
    const row = height - 1 - index

    return values.map(value => {
      const fill = Math.max(0, Math.min(8, levelOf(value) - row * 8))
      if (fill > 0) {
        return { text: `${(EIGHTHS_UP[fill] ?? '█').repeat(2)} `, tone: value >= start ? 'up' : 'down' }
      }

      return row === startRow ? { text: '┄┄┄', tone: 'rule' } : { text: '   ', tone: 'blank' }
    })
  })
}

/** The chart row, counted from the bottom, the start's value falls in. */
export function startRowOf(values: readonly number[], height: number, start: number): number {
  const levelOf = levelsOf(values, height)
  const highest = Math.max(...values)
  const lowest = Math.min(...values)

  return Math.floor((levelOf(Math.min(Math.max(start, lowest), highest)) - 1) / 8)
}

/** How many eighths of the chart's height a value fills: never none, all of it on a flat chart. */
function levelsOf(values: readonly number[], height: number): (value: number) => number {
  const units = height * 8
  const lowest = Math.min(...values)
  const highest = Math.max(...values)
  const floor = lowest - (highest - lowest) * CHART_FLOOR

  return value =>
    highest === floor ? units : Math.max(1, Math.min(units, Math.round(((value - floor) / (highest - floor)) * units)))
}

/**
 * The bankroll after each bet, oldest first. A bet saved before balances were
 * kept is worked back from the newer one after it, or from `current`.
 */
export function balancesOf(bets: readonly { delta: number; balance?: number }[], current: number): number[] {
  const balances: number[] = []
  let after = current
  for (const bet of bets) {
    const balance = bet.balance ?? after
    balances.push(balance)
    after = balance - bet.delta
  }

  return balances.reverse()
}

/** Seconds as a clock: `0:07`, `1:05`. */
export function clockOf(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Credits as money: `$1,090`, `-$1,500`. */
export function moneyOf(credits: number): string {
  const grouped = String(Math.abs(credits)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return `${credits < 0 ? '-' : ''}$${grouped}`
}

/** The bankroll counter `progress` of the way from `from` to `to`, easing out. */
export function countOf(from: number, to: number, progress: number): number {
  const eased = 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3

  return Math.round(from + (to - from) * eased)
}

/**
 * Where coin `index` is at `progress` through the payout: it waits its stagger,
 * falls with ease-in for COIN_FALL, and lands as a full coin; null before it moves.
 */
export function coinOf(index: number, progress: number): { row: number; glyph: '•' | 'o' | '●' } | null {
  const local = Math.max(0, Math.min(1, (progress - index * COIN_STAGGER) / COIN_FALL))
  if (local <= 0) {
    return null
  }

  return {
    row: Math.round(local ** 2 * (COIN_ROWS - 1)),
    glyph: local >= 1 ? '●' : local > 0.8 ? 'o' : '•',
  }
}

/** Cells a string takes on a terminal: a wide character (CJK, emoji) takes two. */
export function widthOf(text: string): number {
  let cells = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isWide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x20000 && code <= 0x3fffd)
    cells += isWide ? 2 : 1
  }

  return cells
}

/** A string cut to `cells` wide, ending in `...` when it was longer. */
export function fitOf(text: string, cells: number): string {
  if (widthOf(text) <= cells) {
    return text
  }

  let fitted = ''
  for (const char of text) {
    if (widthOf(`${fitted}${char}...`) > cells) {
      break
    }
    fitted += char
  }

  return `${fitted}...`
}
