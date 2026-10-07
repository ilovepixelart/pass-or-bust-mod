import type { ClientElements, RenderElement } from 'claude-code'

import Art from '../art'
import Words from '../words'

type Elements = Pick<ClientElements, 'Box' | 'Text'>

/** What a settled bet's payout draws from: plain data, so a `Client` can take it as props. */
export type PayoutProps = {
  kind: 'win' | 'loss' | 'void'
  stake: number
  paid: number
  delta: number
  /** The bankroll before the bet settled, and after: what the counter runs between. */
  from: number
  to: number
  streak: number
  /** How many coins fall: none for a loss, a void, or a band too narrow for them. */
  coins: number
}

/** The stamp's first frame, every letter dim, before the letters come in. */
export const DIM_MS = 40

/** How long each letter waits after the one before it. */
export const LETTER_MS = 40

/** How long the coins fall and the counter runs once the letters are in. */
export const FALL_MS = 720

/** Columns between one coin and the next. */
const COIN_PITCH = 7

const WORDS = { win: 'CASHED OUT', loss: 'BUSTED', void: 'REFUNDED' } as const

const TONES = { win: Art.PALETTE.gold, loss: Art.PALETTE.down, void: Art.PALETTE.muted } as const

/** The word a payout stamps. */
export function wordOf(kind: PayoutProps['kind']): string {
  return WORDS[kind]
}

/** How long a payout's animation runs before it holds still. */
export function payoutDoneMs(props: PayoutProps): number {
  return DIM_MS + wordOf(props.kind).length * LETTER_MS + FALL_MS
}

/** The cells a stamp of this payout takes across. */
export function stampWidthOf(kind: PayoutProps['kind']): number {
  return Art.widthOf(Art.stampRowsOf(wordOf(kind))[0] ?? '')
}

/** How many coins fit across `cells`. */
export function coinsAcross(cells: number): number {
  return Math.max(0, Math.floor((cells - 1) / COIN_PITCH))
}

/**
 * The payout `elapsed` milliseconds in: one dim frame, the letters left to
 * right, then the coins falling and the bankroll counting to its new value.
 */
export function payoutTree({ Box, Text }: Elements, props: PayoutProps, elapsed: number): RenderElement {
  const word = wordOf(props.kind)
  const tone = TONES[props.kind]
  const isDim = elapsed < DIM_MS
  const letters = isDim ? word.length : Math.min(word.length, Math.floor((elapsed - DIM_MS) / LETTER_MS) + 1)
  const progress = Math.max(0, Math.min(1, (elapsed - DIM_MS - word.length * LETTER_MS) / FALL_MS))

  return (
    <Box flexDirection="column">
      {Art.stampRowsOf(word, letters).map((row, index) => (
        <Text key={`stamp-${index}`}>
          {Art.runsOf(row).map(run => (
            <Text color={isDim || run.isShadow ? Art.PALETTE.shadow : tone}>{run.text}</Text>
          ))}
        </Text>
      ))}
      {resultLine({ Box, Text }, props, Art.countOf(props.from, props.to, progress))}
      {props.coins > 0 && coinRows({ Text }, props.coins, progress)}
    </Box>
  )
}

/** A settled bet where the big stamp does not fit: the amount in small block digits, then the result line. */
export function compactPayoutTree({ Box, Text }: Elements, props: PayoutProps): RenderElement {
  const tone = TONES[props.kind]
  const amount = props.kind === 'void' ? '0' : props.delta > 0 ? `+${props.delta}` : `${props.delta}`

  return (
    <Box flexDirection="column">
      {Words.bannerOf(amount).map(row => (
        <Text bold color={tone}>
          {row}
        </Text>
      ))}
      {resultLine({ Box, Text }, props, props.to)}
    </Box>
  )
}

/**
 * The line under a stamp, and the whole of a compact one: the outcome as a
 * glyph and a word, what it paid, and the bankroll as `shown`.
 */
export function resultLine({ Box, Text }: Elements, props: PayoutProps, shown: number): RenderElement {
  const outcome =
    props.kind === 'win' ? (
      <Text bold color={Art.PALETTE.up}>
        ✓ CASHED OUT. +{Art.moneyOf(props.delta)}.
      </Text>
    ) : props.kind === 'loss' ? (
      <Text bold color={Art.PALETTE.down}>
        ✕ BUSTED. -{Art.moneyOf(props.stake)}.
      </Text>
    ) : (
      <Text bold>· REFUNDED. {Art.moneyOf(props.stake)} back.</Text>
    )
  const aside = props.kind === 'win' ? `   paid ${Art.moneyOf(props.paid)}` : ''

  return (
    <Box key="result">
      {outcome}
      <Text dimColor>{aside}   bankroll </Text>
      <Text bold color={Art.PALETTE.gold}>
        {Art.moneyOf(shown)}
      </Text>
      {streakOf({ Text }, props.streak, props.kind === 'loss')}
    </Box>
  )
}

/** A streak as marks and words: `▴▴▴` and `3 wins in a row`; null under two in a row. */
export function streakWordsOf(streak: number): { marks: string; words: string; isWin: boolean } | null {
  if (streak >= 2) {
    return { marks: '▴'.repeat(Math.min(streak, 5)), words: `${streak} wins in a row`, isWin: true }
  }

  return streak <= -2 ? { marks: '▾'.repeat(Math.min(-streak, 5)), words: `${-streak} losses in a row`, isWin: false } : null
}

/** A streak drawn: its marks in the win or loss color, its words plain; after a loss that broke none, `streak over`. */
export function streakOf({ Text }: Pick<Elements, 'Text'>, streak: number, isLoss = false): RenderElement | null {
  const shown = streakWordsOf(streak)
  if (shown === null) {
    return isLoss ? <Text dimColor>   streak over</Text> : null
  }

  return (
    <Text>
      {'   '}
      <Text color={shown.isWin ? Art.PALETTE.up : Art.PALETTE.down}>{shown.marks}</Text> {shown.words}
    </Text>
  )
}

function coinRows({ Text }: Pick<Elements, 'Text'>, coins: number, progress: number): RenderElement[] {
  const rows = Array.from({ length: Art.COIN_ROWS }, () => Array.from({ length: coins * COIN_PITCH }, () => ' '))
  for (let index = 0; index < coins; index += 1) {
    const coin = Art.coinOf(index, progress)
    const row = coin === null ? undefined : rows[coin.row]
    if (coin !== null && row !== undefined) {
      row[index * COIN_PITCH + 1] = coin.glyph
    }
  }

  return rows.map((row, index) => (
    <Text key={`coins-${index}`} color={Art.PALETTE.gold}>
      {row.join('').trimEnd() || ' '}
    </Text>
  ))
}
