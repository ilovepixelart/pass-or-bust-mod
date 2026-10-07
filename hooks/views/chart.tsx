import type { ClientElements, RenderElement } from 'claude-code'

import type { Bank } from '../../types'
import Art from '../art'
import type { Cell } from '../art'
import Limits from '../limits'

type Elements = Pick<ClientElements, 'Box' | 'Text'>

/** What the /bankroll chart draws from: plain data, so a `Client` can take it as props. */
export type ChartProps = {
  /** The chart's rows, top first: one cell per bet. */
  rows: Cell[][]
  /** Each row's axis label, already padded to one width. */
  labels: string[]
  /** One mark per bet, oldest first. */
  marks: ('win' | 'loss' | 'void')[]
}

/** Rows the chart is tall. */
export const CHART_ROWS = 7

/** How long each bar waits after the one before it as the chart draws in. */
export const BAR_MS = 60

const TONE_COLORS = { up: Art.PALETTE.gold, down: Art.PALETTE.down } as const

const MARKS = {
  win: { glyph: '▴', color: Art.PALETTE.up },
  loss: { glyph: '▾', color: Art.PALETTE.down },
  void: { glyph: '·', color: undefined },
} as const

/**
 * The chart of a bankroll's recent bets, or null before it has any. Where
 * `columns` cannot hold them all across, the oldest bars give way.
 */
export function chartPropsOf(bank: Bank, columns = Number.POSITIVE_INFINITY): ChartProps | null {
  for (let count = Math.min(bank.recent.length, Limits.RECENT_BETS); count > 1; count--) {
    const props = chartOfBets(bank, count)
    if (props !== null && widthOf(props) <= columns) {
      return props
    }
  }

  return chartOfBets(bank, 1)
}

/** Cells the chart takes across: the axis labels, the axis, three per bar. */
export function widthOf(props: ChartProps): number {
  return (props.labels[0]?.length ?? 0) + 3 + barsOf(props) * 3
}

function chartOfBets(bank: Bank, count: number): ChartProps | null {
  const bets = bank.recent.slice(0, count)
  if (bets.length === 0) {
    return null
  }

  const after = Art.balancesOf(bets, bank.balance)
  const oldest = bets[bets.length - 1]
  // the first bar is the bankroll before the oldest bet, so one bet already draws a change
  const values = [(after[0] ?? bank.balance) - (oldest?.delta ?? 0), ...after]
  const rows = Art.chartOf(values, CHART_ROWS, Limits.START_BALANCE)
  const highest = Math.max(...values)
  const lowest = Math.min(...values)
  const startRow = CHART_ROWS - 1 - Art.startRowOf(values, CHART_ROWS, Limits.START_BALANCE)
  const named = new Map<number, string>([[0, Art.moneyOf(highest)]])
  if (lowest < highest) {
    named.set(CHART_ROWS - 1, Art.moneyOf(lowest))
  }
  if (Limits.START_BALANCE > lowest && Limits.START_BALANCE < highest && !named.has(startRow)) {
    named.set(startRow, Art.moneyOf(Limits.START_BALANCE))
  }
  const width = Math.max(...[...named.values()].map(label => label.length))

  return {
    rows,
    labels: rows.map((_, index) => (named.get(index) ?? '').padStart(width)),
    marks: [...bets].reverse().map(bet => (bet.outcome === 'void' ? 'void' : bet.delta > 0 ? 'win' : 'loss')),
  }
}

/** The chart with its first `shown` bars drawn: the rest are still to come. */
export function chartTree({ Box, Text }: Elements, props: ChartProps, shown: number): RenderElement {
  const gutter = ' '.repeat((props.labels[0]?.length ?? 0) + 1)
  const columns = barsOf(props)

  return (
    <Box flexDirection="column">
      {props.rows.map((row, index) => (
        <Text>
          <Text dimColor>{props.labels[index]} ┤ </Text>
          {mergedOf(row.slice(0, shown)).map(cell =>
            cell.tone === 'up' || cell.tone === 'down' ? (
              <Text color={TONE_COLORS[cell.tone]}>{cell.text}</Text>
            ) : cell.tone === 'rule' ? (
              <Text dimColor>{cell.text}</Text>
            ) : (
              <Text>{cell.text}</Text>
            ),
          )}
        </Text>
      ))}
      <Text dimColor>
        {gutter}└{'─'.repeat(columns * 3)}
      </Text>
      <Text>
        {gutter}
        {/* the first bar is the bankroll before any bet: no mark under it */}
        {'     '}
        {props.marks.slice(0, Math.max(0, shown - 1)).map(mark => (
          <Text color={MARKS[mark].color} dimColor={mark === 'void'}>
            {MARKS[mark].glyph}
            {'  '}
          </Text>
        ))}
      </Text>
    </Box>
  )
}

/** How many bars the chart draws: one per bet, and the bankroll before the first. */
export function barsOf(props: ChartProps): number {
  return props.rows[0]?.length ?? 0
}

function mergedOf(cells: readonly Cell[]): Cell[] {
  const merged: Cell[] = []
  for (const cell of cells) {
    const last = merged[merged.length - 1]
    if (last !== undefined && last.tone === cell.tone) {
      last.text += cell.text
    } else {
      merged.push({ ...cell })
    }
  }

  return merged
}
