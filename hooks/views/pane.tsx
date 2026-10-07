import type { Elements, RenderElement } from 'claude-code'

import type { Bank, Bet, Slip } from '../../types'
import Art from '../art'
import type { History } from '../odds'
import Words from '../words'
import { barsOf, chartPropsOf, chartTree } from './chart'
import type { ChartProps } from './chart'

/** Builds the chart's animated region; the hooks module makes it, null where no `Client` is drawn. */
export type PaneClients = { chart: (key: string, props: ChartProps) => RenderElement | null }

/** The ledger's label column. */
const LABEL = 14

/** The settled bets listed under the chart, newest first. */
const LISTED = 5

/** The pass-rate gauge's width. */
const GAUGE = 26

const MARKS = {
  win: { glyph: '▴', color: Art.PALETTE.up },
  loss: { glyph: '▾', color: Art.PALETTE.down },
} as const

/**
 * /bankroll's pane: the balance and lifetime P&L, a chart of the bankroll over
 * the recent bets, the ledger, the rank, and the last few bets. Body text is
 * drawn in the terminal's own color; only outcomes, money and the house have one.
 */
export function pane(
  { Box, Text }: Elements['terminal'] | Elements['desktop'],
  view: { bank: Bank; slip: Slip | null; history: History; bodyColumns: number },
  clients: PaneClients,
): RenderElement {
  const { bank, slip, history } = view
  const columns = view.bodyColumns
  const chart = chartPropsOf(bank, columns)
  const decided = bank.wins + bank.losses
  const runs = history.passes + history.fails
  const rate = runs === 0 ? null : history.passes / runs
  // the gauge gives way before the line wraps: label, gauge, a six-cell percentage
  const gauge = Art.gaugeOf(rate ?? 0, Math.max(4, Math.min(GAUGE, columns - LABEL - 6)))
  const next = Words.nextRankOf(bank)
  const label = (text: string) => <Text dimColor>{text.padEnd(LABEL)}</Text>

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>BANKROLL</Text>
        <Text>   </Text>
        <Text bold color={Art.PALETTE.gold}>
          {Art.moneyOf(bank.balance)}
        </Text>
        <Text dimColor>   P&amp;L </Text>
        {signedOf({ Text }, bank.pnl)}
      </Box>
      {/* right under the balance: an inline pane may show only its first dozen rows */}
      <Box>
        {label('Rank')}
        <Text bold color={Art.PALETTE.house}>
          {Words.rankOf(bank)}
        </Text>
        {next !== null && LABEL + Words.rankOf(bank).length + nextText(next).length <= columns && (
          <Text dimColor>
            {'   '}next: {next.title} at {next.at > 0 ? '+' : ''}
            {Art.moneyOf(next.at)}
          </Text>
        )}
      </Box>
      <Text> </Text>
      {chart === null ? (
        <Text dimColor>No bets yet. Bet when the tests run.</Text>
      ) : (
        clients.chart('chart', chart) ?? chartTree({ Box, Text }, chart, barsOf(chart))
      )}
      <Text> </Text>
      <Box>
        {label('Bets')}
        <Text>{ledgerOf(bank, columns - LABEL)}</Text>
      </Box>
      <Box>
        {label('Pass rate')}
        {rate === null ? (
          <Text dimColor>none settled here yet</Text>
        ) : (
          <Text>
            <Text color={Art.PALETTE.up}>{gauge.filled}</Text>
            <Text dimColor>{gauge.rest}</Text>
            {`${Math.round(rate * 100)}%`.padStart(6)}
          </Text>
        )}
      </Box>
      <Box>
        {label('Best streak')}
        {bank.bestStreak > 0 && <Text color={Art.PALETTE.up}>{'▴'.repeat(Math.min(bank.bestStreak, 5))} </Text>}
        <Text>{Words.bestStreakOf(bank.bestStreak)}</Text>
      </Box>
      <Box>
        {label('Bailouts')}
        <Text>{bank.bailouts}</Text>
      </Box>
      <Text> </Text>
      <Text dimColor>
        {slip === null
          ? 'No open bet.'
          : `Open bet: ${Art.moneyOf(slip.stake)} on ${slip.side === 'pass' ? '✓ PASS' : '✕ FAIL'} at ${Words.priceOf(slip.multiplier)}`}
      </Text>
      {bank.recent.length > 0 && <Text bold>LAST BETS</Text>}
      {bank.recent.slice(0, LISTED).map(bet => betRow({ Box, Text }, bet, view.bodyColumns))}
    </Box>
  )
}

/** The rank line's tail, as drawn: `   next: The House at +$1,000`. */
function nextText(next: { title: string; at: number }): string {
  return `   next: ${next.title} at ${next.at > 0 ? '+' : ''}${Art.moneyOf(next.at)}`
}

/** The settled bets in `room` cells: the longest of these that fits, the last whatever the room. */
function ledgerOf(bank: Bank, room: number): string {
  const decided = bank.wins + bank.losses
  const percent = decided === 0 ? '' : `${Math.round((bank.wins / decided) * 100)}%`
  const counts = `${bank.wins} won · ${bank.losses} lost`
  const forms = [
    `${counts} · ${bank.voids} void${percent === '' ? '' : ` · win rate ${percent}`}`,
    `${counts}${bank.voids > 0 ? ` · ${bank.voids} void` : ''}${percent === '' ? '' : ` · ${percent}`}`,
    `${counts}${percent === '' ? '' : ` · ${percent}`}`,
  ]

  return forms.find(form => form.length <= room) ?? (forms[forms.length - 1] as string)
}

function signedOf({ Text }: Pick<Elements['terminal'], 'Text'>, credits: number): RenderElement {
  if (credits === 0) {
    return <Text>· {Art.moneyOf(0)}</Text>
  }
  const mark = credits > 0 ? MARKS.win : MARKS.loss

  return (
    <Text color={mark.color}>
      {mark.glyph} {credits > 0 ? '+' : ''}
      {Art.moneyOf(credits)}
    </Text>
  )
}

function betRow({ Box, Text }: Pick<Elements['terminal'], 'Box' | 'Text'>, bet: Bet, bodyColumns: number): RenderElement {
  const side = bet.side === 'pass' ? '✓ PASS' : '✕ FAIL'
  const ran = bet.outcome === 'void' ? 'void' : bet.outcome === 'pass' ? 'passed' : 'failed'
  const amount = `${bet.delta > 0 ? '+' : ''}${Art.moneyOf(bet.delta)}`.padEnd(8)
  const full = `  ${side} at ${Words.priceOf(bet.multiplier)}, ${ran}: `
  // the command only where at least eight cells of it fit
  const room = bodyColumns - 2 - amount.length - Art.widthOf(full)
  const rest = room >= 8 ? full : `  ${side} ${Words.priceOf(bet.multiplier)}, ${ran}`
  const command = room >= 8 ? Art.fitOf(bet.command, room) : ''

  return (
    <Box>
      {bet.outcome === 'void' || bet.delta === 0 ? (
        <Text>· {amount}</Text>
      ) : (
        <Text color={bet.delta > 0 ? MARKS.win.color : MARKS.loss.color}>
          {bet.delta > 0 ? MARKS.win.glyph : MARKS.loss.glyph} {amount}
        </Text>
      )}
      <Text>
        {rest}
        {command}
      </Text>
    </Box>
  )
}
