import type { Elements, RenderElement } from 'claude-code'

import type { Bank, Market, Slip, SlotsRun, Stamp } from '../../types'
import Art from '../art'
import Bankroll from '../bankroll'
import Limits from '../limits'
import type { Action } from '../market'
import Words from '../words'
import { coinsAcross, compactPayoutTree, payoutDoneMs, payoutTree, stampWidthOf, streakOf, streakWordsOf } from './payout'
import type { PayoutProps } from './payout'
import { REELS_COLUMNS, SLOTS_ROWS } from './slots'
import type { SlotsProps } from './slots'

type View = { market: Market; slip: Slip | null; bank: Bank; stamp: Stamp | null; slots: SlotsRun | null }

type Handlers = { act: (action: Action) => unknown; hide: () => unknown }

/** The room the band is laid out in: `bodyColumns` and `maxRows` of its render props. */
export type Fit = { bodyColumns: number; maxRows: number }

/**
 * Builds the band's animated regions. The hooks module makes them, since the
 * engine loads a surface module only from a literal path in its own source;
 * null where the surface draws no `Client`.
 */
export type Clients = {
  slots: (key: string, props: SlotsProps) => RenderElement | null
  clock: (key: string) => RenderElement | null
  payout: (key: string, props: PayoutProps) => RenderElement | null
}

/** Cells the frame takes across: the border and two cells of padding each side. */
const FRAME_COLUMNS = 6

/** Rows the frame takes: the border above and below. */
const FRAME_ROWS = 2

/** Rows the market takes inside the frame: headline, odds, controls, taunt. */
const MARKET_ROWS = 4

/** The narrowest side panel the slot machine is drawn with. */
const SIDE_LEAST = 20

/** Cells between the reels and the side panel. */
const SIDE_GAP = 4

/** The widest and narrowest the odds gauge is drawn. */
const GAUGE_CELLS = { most: 28, least: 4 }

/** A key hint: where the keys work, then each key and what it does. */
type Hint = { where: string; keys: readonly (readonly [key: string, action: string])[] }

/** While the tests run the prompt is empty, and a bare digit bets. */
const HINT: Hint = { where: 'empty prompt', keys: [['1', 'pass'], ['2', 'fail']] }

/** Between runs Claude has usually left a suggestion in the prompt, where a bare digit would go: focus the band first. */
const HINT_BETWEEN: Hint = { where: 'ctrl+x tab', keys: [['1', 'pass'], ['2', 'fail']] }

/** A letter answers only once the band holds the focus. */
const HINT_CANCEL: Hint = { where: 'ctrl+x tab', keys: [['c', 'cancel']] }

const HINT_BAILOUT: Hint = { where: 'ctrl+x tab', keys: [['b', 'bailout']] }

/** A hint as drawn: `  ctrl+x tab: 1 pass · 2 fail`, the keys bold, the rest muted. */
function hintText(hint: Hint): string {
  return `  ${hint.where}: ${hint.keys.map(([key, action]) => `${key} ${action}`).join(' · ')}`
}

function hintOf({ Text }: Pick<Elements['terminal'], 'Text'>, hint: Hint): RenderElement {
  return (
    <Text key="hint">
      <Text dimColor>  {hint.where}: </Text>
      {hint.keys.map(([key, action], index) => (
        <Text key={key}>
          {index > 0 && <Text dimColor> · </Text>}
          <Text bold>{key}</Text>
          <Text dimColor> {action}</Text>
        </Text>
      ))}
    </Text>
  )
}

const LAST = {
  pass: { mark: '✓ passed', color: Art.PALETTE.up },
  fail: { mark: '✕ failed', color: Art.PALETTE.down },
  void: { mark: '· never finished', color: undefined },
} as const

/**
 * The band above the prompt: a framed market while the tests run (the run,
 * the odds, the bets, the house), or a settled bet's stamp for a few seconds.
 * Everything is sized to `bodyColumns`, and the frame is dropped where it
 * would not fit `maxRows`.
 */
export function band(
  { Box, Text, Button }: Elements['terminal'] | Elements['desktop'],
  view: View,
  handlers: Handlers,
  fit: Fit,
  clients: Clients,
): RenderElement {
  const { market, slip, bank, stamp } = view

  const machine = slotsOf({ Box, Text, Button }, view, handlers, fit, clients)
  if (machine !== null) {
    return machine
  }

  if (stamp !== null) {
    return stamped({ Box, Text }, payoutPropsOf(stamp, bank, fit), fit, clients, stamp.id)
  }

  const isFramed = fit.maxRows >= MARKET_ROWS + FRAME_ROWS
  const inner = fit.bodyColumns - (isFramed ? FRAME_COLUMNS : 0)
  const money = Art.moneyOf(bank.balance)
  const streakWords = streakWordsOf(bank.streak)
  const pass = `✓ PASS ${Words.priceOf(market.odds.pass)}`
  const fail = `✕ FAIL ${Words.priceOf(market.odds.fail)}`
  const fixedCells = Art.widthOf(pass) + Art.widthOf(fail) + 4 + money.length
  // what gives way first where the row would wrap: the streak's words, its marks, then the bankroll's label
  const trims = [
    { label: '   bankroll ', streak: streakWords === null ? 0 : 3 + streakWords.marks.length + 1 + streakWords.words.length, words: true },
    { label: '   bankroll ', streak: streakWords === null ? 0 : 3 + streakWords.marks.length, words: false },
    { label: '   bankroll ', streak: 0, words: false },
    { label: '   ', streak: 0, words: false },
  ]
  const trim = trims.find(form => fixedCells + form.label.length + form.streak + GAUGE_CELLS.least <= inner) ?? (trims[trims.length - 1] as (typeof trims)[number])
  const oddsCells = fixedCells + trim.label.length + trim.streak
  const streak =
    trim.streak === 0 || streakWords === null ? null : trim.words ? (
      streakOf({ Text }, bank.streak)
    ) : (
      <Text>
        {'   '}
        <Text color={streakWords.isWin ? Art.PALETTE.up : Art.PALETTE.down}>{streakWords.marks}</Text>
      </Text>
    )
  const gauge = Art.gaugeOf(market.passChance, Math.max(GAUGE_CELLS.least, Math.min(GAUGE_CELLS.most, inner - oddsCells)))

  const rows = [
    headline({ Text, Box }, market, inner, clients),
    <Box key="odds">
      <Text bold color={Art.PALETTE.up}>
        {pass}
      </Text>
      <Text>  </Text>
      <Text color={Art.PALETTE.up}>{gauge.filled}</Text>
      <Text dimColor>{gauge.rest}</Text>
      <Text>  </Text>
      <Text bold color={Art.PALETTE.down}>
        {fail}
      </Text>
      <Text dimColor>{trim.label}</Text>
      <Text bold color={Art.PALETTE.gold}>
        {money}
      </Text>
      {streak}
    </Box>,
    controls({ Box, Text, Button }, view, handlers, inner),
    <Text key="taunt" color={Art.PALETTE.house}>
      {Art.fitOf(Words.tauntOf(market.runs), inner)}
    </Text>,
  ]

  return (
    <Box
      flexDirection="column"
      {...(isFramed ? { borderStyle: 'round', borderColor: slip === null ? Art.PALETTE.muted : Art.PALETTE.gold, paddingX: 2 } : {})}
    >
      {rows}
    </Box>
  )
}

function headline(
  { Text, Box }: Pick<Elements['terminal'], 'Text' | 'Box'>,
  market: Market,
  inner: number,
  clients: Clients,
): RenderElement {
  if (market.isRunning) {
    const clock = clients.clock(`clock-${market.runs}`)
    const command = Art.fitOf(market.command, Math.max(8, inner - '$ TESTS RUNNING'.length - 3 - 7 - '   Will they pass?'.length))

    return (
      <Box key="headline">
        <Text bold color={Art.PALETTE.gold}>
          $ TESTS RUNNING
        </Text>
        <Text>   {command}</Text>
        {clock !== null && <Text>   </Text>}
        {clock}
        <Text>   Will they pass?</Text>
      </Box>
    )
  }

  const last = market.last === null ? null : LAST[market.last]

  return (
    <Box key="headline">
      <Text bold color={Art.PALETTE.gold}>
        $ NEXT RUN
      </Text>
      {last !== null && <Text>   Last run </Text>}
      {last !== null && (
        <Text color={last.color} dimColor={last.color === undefined}>
          {last.mark}
        </Text>
      )}
      <Text>   Will they pass?</Text>
    </Box>
  )
}

function controls(
  { Box, Text, Button }: Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>,
  { market, slip, bank }: View,
  handlers: Handlers,
  inner: number,
  hasHint = true,
): RenderElement {
  const hide = <Button key="hide" label="Hide" onPress={handlers.hide} />

  if (slip !== null) {
    const side = slip.side === 'pass' ? '✓ PASS' : '✕ FAIL'
    const ifWins = slip.side === 'pass' ? 'pass' : 'fail'
    const bet = `> YOUR BET  ${Art.moneyOf(slip.stake)} on ${side} at ${Words.priceOf(slip.multiplier)}`
    const buttons = market.isRunning ? '[ Hide ]' : 'c: Cancel bet [ Hide ]'
    const long = `   pays ${Art.moneyOf(Bankroll.paysOf(slip))} if the tests ${ifWins}   `
    const hint = hasHint && !market.isRunning ? hintText(HINT_CANCEL) : ''
    // the whole line where it fits with its hint; where it does not, only what it pays
    const pays = Art.widthOf(bet + long + buttons + hint) <= inner ? long : `   pays ${Art.moneyOf(Bankroll.paysOf(slip))}   `

    return (
      <Box key="controls">
        <Text bold color={Art.PALETTE.gold}>
          {bet}
        </Text>
        <Text dimColor>{pays}</Text>
        {!market.isRunning && <Button key="cancel" label="Cancel bet" hotkey="c" plain onPress={() => handlers.act('cancel')} />}
        {!market.isRunning && <Text> </Text>}
        {hide}
        {hint !== '' && Art.widthOf(bet + pays + buttons + hint) <= inner && hintOf({ Text }, HINT_CANCEL)}
      </Box>
    )
  }

  if (bank.balance < Limits.STAKE) {
    return (
      <Box key="controls">
        {/* the machine's side panel already says it */}
        {hasHint && <Text>Broke. </Text>}
        <Button key="bailout" label="Bailout" hotkey="b" plain onPress={() => handlers.act('bailout')} />
        <Text>   </Text>
        {hide}
        {hasHint && hintOf({ Text }, HINT_BAILOUT)}
      </Box>
    )
  }

  const stake = Art.moneyOf(Limits.STAKE)
  // plain Buttons draw `1: label`; Hide draws `[ Hide ]`
  const buttonsCells = `1: ✓ Bet pass ${stake}   2: ✕ Bet fail ${stake}   [ Hide ]`.length
  const hint = market.isRunning ? HINT : HINT_BETWEEN

  return (
    <Box key="controls">
      <Button key="bet-pass" label={`✓ Bet pass ${stake}`} hotkey="1" plain onPress={() => handlers.act('bet-pass')} />
      <Text>   </Text>
      <Button key="bet-fail" label={`✕ Bet fail ${stake}`} hotkey="2" plain onPress={() => handlers.act('bet-fail')} />
      <Text>   </Text>
      {hide}
      {hasHint && buttonsCells + hintText(hint).length <= inner && hintOf({ Text }, hint)}
    </Box>
  )
}

/**
 * A settled bet: the big stamp where it fits across and down (coins only on a
 * win with room for them), else the compact banner and the same result line.
 */
function stamped(
  { Box, Text }: Pick<Elements['terminal'], 'Box' | 'Text'>,
  props: PayoutProps,
  fit: Fit,
  clients: Clients,
  id: number,
): RenderElement {
  const stampRows = 6 + 1
  const fitsAcross = stampWidthOf(props.kind) + FRAME_COLUMNS <= fit.bodyColumns
  const withCoins = props.coins > 0 && stampRows + 4 + FRAME_ROWS <= fit.maxRows
  const fitsDown = stampRows + FRAME_ROWS <= fit.maxRows
  const tone = props.kind === 'win' ? Art.PALETTE.gold : props.kind === 'loss' ? Art.PALETTE.down : Art.PALETTE.muted

  if (fitsAcross && fitsDown) {
    const shown = { ...props, coins: withCoins ? props.coins : 0 }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={tone} paddingX={2}>
        {clients.payout(`stamp-${id}`, shown) ?? payoutTree({ Box, Text }, shown, payoutDoneMs(shown))}
      </Box>
    )
  }

  return compactPayoutTree({ Box, Text }, props)

}

/**
 * The slot machine, framed, with the bet buttons under it while the tests run;
 * null where it does not fit (it needs SLOTS_ROWS and the frame down, the
 * reels and a narrow side panel across) or the surface draws no `Client`.
 */
function slotsOf(
  { Box, Text, Button }: Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>,
  view: View,
  handlers: Handlers,
  fit: Fit,
  clients: Clients,
): RenderElement | null {
  const run = view.slots
  const sideColumns = fit.bodyColumns - FRAME_COLUMNS - REELS_COLUMNS - SIDE_GAP
  if (run === null || fit.maxRows < SLOTS_ROWS + FRAME_ROWS + 1 || sideColumns < SIDE_LEAST) {
    return null
  }

  const settled = run.settled
  const slip = settled === null ? view.slip : settled.slip
  const payout = settled !== null && settled.slip !== null && view.stamp !== null ? payoutPropsOf(view.stamp, view.bank, fit) : null
  const machine = clients.slots(`slots-${run.id}`, {
    run: run.id,
    command: view.market.command,
    isBroke: view.bank.balance < Limits.STAKE,
    slip: slip === null ? null : { side: slip.side, stake: slip.stake, multiplier: slip.multiplier, pays: Bankroll.paysOf(slip) },
    result: settled === null ? null : { outcome: settled.outcome, payout, seconds: settled.seconds },
    sideColumns,
    columns: fit.bodyColumns - FRAME_COLUMNS,
  })
  if (machine === null) {
    return null
  }

  // the side panel already shows a bet: under the reels, only the buttons the moment allows
  const buttons =
    settled !== null ? (
      <Text> </Text>
    ) : slip !== null ? (
      <Box>
        <Button key="hide" label="Hide" onPress={handlers.hide} />
      </Box>
    ) : (
      // the side panel already says how to bet
      controls({ Box, Text, Button }, view, handlers, fit.bodyColumns - FRAME_COLUMNS, false)
    )

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={slip === null ? Art.PALETTE.muted : Art.PALETTE.gold}
      paddingX={2}
      minWidth={Math.min(fit.bodyColumns, REELS_COLUMNS + SIDE_GAP + SIDE_LEAST + 12 + FRAME_COLUMNS)}
    >
      {machine}
      {buttons}
    </Box>
  )
}

function payoutPropsOf(stamp: Stamp, bank: Bank, fit: Fit): PayoutProps {
  const kind = stamp.outcome === 'void' ? 'void' : stamp.delta > 0 ? 'win' : 'loss'

  return {
    kind,
    stake: stamp.stake,
    paid: stamp.paid,
    delta: stamp.delta,
    from: bank.balance - stamp.paid,
    to: bank.balance,
    streak: bank.streak,
    coins: kind === 'win' ? coinsAcross(fit.bodyColumns - FRAME_COLUMNS) : 0,
  }
}
