import type { ClientElements, RenderElement } from 'claude-code'

import type { Outcome } from '../settle'
import Art from '../art'
import Slots from '../slots'
import type { Symbol } from '../slots'
import { compactPayoutTree, DIM_MS, LETTER_MS, payoutDoneMs, payoutTree, stampWidthOf, wordOf } from './payout'
import type { PayoutProps } from './payout'

type Elements = Pick<ClientElements, 'Box' | 'Text'>

/** What the slot machine draws from: plain data, so a `Client` can take it as props. */
export type SlotsProps = {
  /** Which run the machine shows: its posts name it, so the host knows which run they are about. */
  run: number
  command: string
  /** The bet on this run, if any: its side, stake, odds and what it pays. */
  slip: { side: 'pass' | 'fail'; stake: number; multiplier: number; pays: number } | null
  /** Set once the run settles: the real outcome, and the bet's payout when there was one. */
  result: { outcome: Outcome; payout: PayoutProps | null; seconds: number | null } | null
  /** Whether the bankroll is below one stake: then there is no bet to offer, only the bailout. */
  isBroke: boolean
  /** Cells across the side panel may take. */
  sideColumns: number
  /** Cells across the whole machine may take: the stamp falls back to the compact banner past it. */
  columns: number
}

/** The instance's clock: time since it mounted, and when it saw the run settle. */
export type SlotsClock = { time: number; settledAt: number | null }

/** How long the stopped reels hold before the tally. */
export const HOLD_MS = 900

/** How long the pile takes to grow, and how long the finished tally holds. */
const PILE_MS = 600
const TALLY_HOLD_MS = 300

/** How long the shake lasts when the payout's last digit lands. */
const SHAKE_MS = 80

/** Rows the machine takes: the reels' frame and window, and the status line under them. */
export const SLOTS_ROWS = Slots.WINDOW_ROWS + 2 + 1

/** Cells the reels take across, the payline marks included. */
export const REELS_COLUMNS = 2 + 3 * 11 + 2 * 3 + 2

/** Cells between the reels and the side panel. */
const GAP = '    '

const TONES = { up: Art.PALETTE.up, down: Art.PALETTE.down, gold: Art.PALETTE.gold, house: Art.PALETTE.house, muted: Art.PALETTE.muted } as const

const RAN = { pass: 'TESTS PASSED.', fail: 'TESTS FAILED.', void: 'NO RESULT.' } as const

const MARKS = { pass: '✓', fail: '✕', void: '·' } as const

/** The sentence after the run's word, by what the bet came to; none without a bet. */
const VERDICT = { win: ' You called it.', loss: ' The house thanks you.', void: ' Stake refunded.', none: ' No money on it.' } as const

/** The tally's headline: the payout's word, then one sentence. */
const TALLIED = { win: '✓ CASHED OUT. Count it.', loss: '✕ BUSTED. The house counts it.', void: '· REFUNDED. No harm done.' } as const

/** The taunt while the reels spin. */
export const SPIN_TAUNT = 'The reels are rigged. By your test suite.'

/** When the tally starts and ends, for a run settled at `settledAt` with this payout. */
export function tallyWindowOf(settledAt: number, payout: Pick<PayoutProps, 'paid'>): { from: number; to: number } {
  const from = Slots.stoppedAt(settledAt) + HOLD_MS
  const landed = Slots.ROLL_AT_MS + String(payout.paid).length * Slots.DIGIT_MS

  return { from, to: from + landed + PILE_MS + TALLY_HOLD_MS }
}

/** When, after the run settles, the stamp's last letter is down: the moment the toast and the sound may come. */
export function stampLandsMsOf(payout: Pick<PayoutProps, 'kind' | 'paid'>): number {
  return tallyWindowOf(0, payout).to + DIM_MS + wordOf(payout.kind).length * LETTER_MS
}

/** How long the whole show runs after the run settles: reels, then tally and stamp when there was a bet. */
export function showMsOf(payout: PayoutProps | null): number {
  const reels = Slots.stoppedAt(0) + HOLD_MS
  if (payout === null) {
    return reels + HOLD_MS
  }

  return tallyWindowOf(0, payout).to + payoutDoneMs(payout) + HOLD_MS
}

/**
 * The machine at `clock`: reels spinning, then stopping on the result with the
 * side panel and the status line; then, for a bet, the tally and the stamp.
 */
export function slotsTree(elements: Elements, props: SlotsProps, clock: SlotsClock): RenderElement {
  const { settledAt } = clock
  const payout = props.result?.payout ?? null
  if (settledAt !== null && payout !== null) {
    const tally = tallyWindowOf(settledAt, payout)
    if (clock.time >= tally.to) {
      return stampWidthOf(payout.kind) <= props.columns
        ? payoutTree(elements, payout, clock.time - tally.to)
        : compactPayoutTree(elements, payout)
    }
    if (clock.time >= tally.from) {
      return tallyTree(elements, props, payout, clock.time - tally.from)
    }
  }

  return machineTree(elements, props, clock)
}

function machineTree({ Box, Text }: Elements, props: SlotsProps, clock: SlotsClock): RenderElement {
  const outcome = props.result?.outcome ?? null
  const settledAt = outcome === null ? null : clock.settledAt
  const offsets = Slots.offsetsAt(clock.time, settledAt, outcome)
  const isStopped = settledAt !== null && clock.time >= Slots.stoppedAt(settledAt)
  // the run's own length once it settled; until then, the time the machine has spun
  const seconds = props.result?.seconds ?? Math.floor((settledAt ?? clock.time) / 1000)
  const windows = offsets.map(offset => Slots.windowOf(offset))
  const frame = (edge: string) => (
    <Text dimColor>
      {'  '}
      {[0, 1, 2].map(() => edge).join('   ')}
    </Text>
  )
  const side = sidePanel({ Text }, props, settledAt === null ? 'running' : 'finished', seconds)

  return (
    <Box flexDirection="column">
      <Box>
        <Box flexDirection="column">
          {frame('┌─────────┐')}
          {Array.from({ length: Slots.WINDOW_ROWS }, (_, row) => (
            <Text>
              {row === 3 ? <Text color={Art.PALETTE.gold}>{'>'}</Text> : ' '}{' '}
              {windows.map((window, reel) => {
                const cell = window[row]

                return (
                  <Text>
                    {reel > 0 ? '   ' : ''}
                    <Text dimColor>{'│ '}</Text>
                    {cell === undefined ? null : tileRow({ Text }, cell.symbol, cell.art, cell.isPayline)}
                    <Text dimColor>{' │'}</Text>
                  </Text>
                )
              })}{' '}
              {row === 3 ? <Text color={Art.PALETTE.gold}>{'<'}</Text> : ' '}
            </Text>
          ))}
          {frame('└─────────┘')}
        </Box>
        <Text>{GAP}</Text>
        <Box flexDirection="column">{side}</Box>
      </Box>
      {statusOf({ Text }, props, outcome, isStopped)}
    </Box>
  )
}

function tileRow({ Text }: Pick<Elements, 'Text'>, symbol: Symbol, art: string, isPayline: boolean): RenderElement {
  if (!isPayline) {
    // off the payline the reel is a blur: the art's shape in shade, dim
    return <Text dimColor>{[...art].map(char => (char === ' ' ? ' ' : '░')).join('')}</Text>
  }

  return <Text color={TONES[Slots.TILES[symbol].tone]}>{art}</Text>
}

function sidePanel(
  { Text }: Pick<Elements, 'Text'>,
  props: SlotsProps,
  phase: 'running' | 'finished',
  seconds: number,
): RenderElement[] {
  const fit = (text: string) => Art.fitOf(text, props.sideColumns)
  const rows: RenderElement[] = [
    <Text bold color={Art.PALETTE.gold}>
      {phase === 'running' ? '$ TESTS RUNNING' : '$ TESTS FINISHED'}
    </Text>,
    <Text>{fit(props.command)}</Text>,
    <Text> </Text>,
    <Text>
      <Text dimColor>time </Text>
      {Art.clockOf(seconds)}
    </Text>,
    <Text> </Text>,
  ]
  const { slip } = props
  if (slip === null) {
    rows.push(<Text dimColor>{fit(props.isBroke ? 'Broke. Bailout below.' : 'No bet yet.')}</Text>)

    return rows
  }

  rows.push(
    <Text bold color={Art.PALETTE.gold}>
      YOUR BET
    </Text>,
    <Text>
      {Art.moneyOf(slip.stake)} on{' '}
      <Text bold color={slip.side === 'pass' ? Art.PALETTE.up : Art.PALETTE.down}>
        {slip.side === 'pass' ? '✓ PASS' : '✕ FAIL'}
      </Text>
    </Text>,
    <Text>
      <Text dimColor>pays </Text>
      <Text color={Art.PALETTE.gold}>{Art.moneyOf(slip.pays)}</Text>
    </Text>,
  )

  return rows
}

function statusOf(
  { Text }: Pick<Elements, 'Text'>,
  props: SlotsProps,
  outcome: Outcome | null,
  isStopped: boolean,
): RenderElement {
  if (outcome === null) {
    return <Text color={Art.PALETTE.house}>{'  '}{SPIN_TAUNT}</Text>
  }
  if (!isStopped) {
    return <Text dimColor>{'  '}Tests finished. The reels are slowing down...</Text>
  }

  const payout = props.result?.payout ?? null
  const verdict = VERDICT[payout === null ? 'none' : payout.kind]
  const color = outcome === 'pass' ? Art.PALETTE.up : outcome === 'fail' ? Art.PALETTE.down : undefined

  return (
    <Text>
      {'  '}
      <Text bold color={color}>
        {MARKS[outcome]} {RAN[outcome]}
      </Text>
      {verdict}
    </Text>
  )
}

function tallyTree({ Box, Text }: Elements, props: SlotsProps, payout: PayoutProps, time: number): RenderElement {
  const outcome = props.result?.outcome ?? 'void'
  const won = payout.kind === 'win'
  const multiplier = props.slip?.multiplier ?? 0
  const landedAt = Slots.ROLL_AT_MS + String(payout.paid).length * Slots.DIGIT_MS
  const isShaking = time >= landedAt && time < landedAt + SHAKE_MS
  const pile = Math.round(Slots.pileOf(won ? payout.paid : 0) * Math.max(0, Math.min(1, (time - landedAt) / PILE_MS)))
  const bottom = Math.min(pile, 15)
  const top = pile - bottom
  const centered = (count: number) => ' '.repeat(Math.max(0, 20 - Math.floor(count / 2))) + '●'.repeat(count)

  return (
    <Box flexDirection="column" paddingLeft={isShaking ? 1 : 0}>
      <Text bold color={won ? Art.PALETTE.up : payout.kind === 'loss' ? Art.PALETTE.down : undefined}>
        {TALLIED[payout.kind]}
      </Text>
      <Text> </Text>
      <Text>
        <Text dimColor>stake </Text>
        <Text bold color={Art.PALETTE.gold}>
          {Art.moneyOf(payout.stake)}
        </Text>
        {won && time >= Slots.ROLL_AT_MS / 2 && (
          <Text>
            <Text dimColor>{'  x  '}</Text>
            <Text bold color={Art.PALETTE.gold}>
              x{multiplier.toFixed(2)}
            </Text>
          </Text>
        )}
        {won && time >= Slots.ROLL_AT_MS && (
          <Text>
            <Text dimColor>{'  =  '}</Text>
            <Text bold color={Art.PALETTE.gold}>
              ${Slots.rolledOf(payout.paid, time)}
            </Text>
          </Text>
        )}
        {!won && time >= Slots.ROLL_AT_MS / 2 && (
          <Text>
            <Text dimColor>{'  ->  '}</Text>
            <Text bold color={payout.kind === 'loss' ? Art.PALETTE.down : undefined}>
              {payout.kind === 'loss' ? 'the house' : 'back to you'}
            </Text>
          </Text>
        )}
      </Text>
      <Text> </Text>
      <Text color={Art.PALETTE.gold}>{top > 0 ? centered(top) : ' '}</Text>
      <Text color={Art.PALETTE.gold}>{bottom > 0 ? centered(bottom) : ' '}</Text>
    </Box>
  )
}

/** What the machine tells the host about a run: it is on screen, its reels have stopped, its stamp is down. */
export type SlotsPost = { event: 'spinning' | 'stopped' | 'landed'; run: number }

/** The machine's post for `clock`, if one is due and not yet sent: each event once, in order. */
export function postDueOf(props: SlotsProps, clock: SlotsClock, sent: ReadonlySet<SlotsPost['event']>): SlotsPost | null {
  const { settledAt } = clock
  if (!sent.has('spinning')) {
    return { event: 'spinning', run: props.run }
  }
  if (settledAt === null || props.result === null) {
    return null
  }
  if (!sent.has('stopped')) {
    return clock.time >= Slots.stoppedAt(settledAt) ? { event: 'stopped', run: props.run } : null
  }
  const payout = props.result.payout
  if (payout !== null && !sent.has('landed') && clock.time >= settledAt + stampLandsMsOf(payout)) {
    return { event: 'landed', run: props.run }
  }

  return null
}

/** A post from the machine, read back from plain data; null for anything else. */
export function slotsPostOf(data: unknown): SlotsPost | null {
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const { event, run } = data as Record<string, unknown>
  const isEvent = event === 'spinning' || event === 'stopped' || event === 'landed'

  return isEvent && typeof run === 'number' ? { event, run } : null
}
