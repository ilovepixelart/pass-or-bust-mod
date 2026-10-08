import type { Bank, Bet, Market, Stamp } from '../../types'
import type { Outcome } from '../settle'

const COMMAND_SHOWN = 60

/** Block characters three rows tall, three columns wide: what a banner is drawn with. */
const GLYPHS: Record<string, readonly [string, string, string]> = {
  '0': ['█▀█', '█ █', '▀▀▀'],
  '1': ['▀█ ', ' █ ', '▀▀▀'],
  '2': ['▀▀█', '█▀▀', '▀▀▀'],
  '3': ['▀▀█', ' ▀█', '▀▀▀'],
  '4': ['█ █', '▀▀█', '  ▀'],
  '5': ['█▀▀', '▀▀█', '▀▀▀'],
  '6': ['█▀▀', '█▀█', '▀▀▀'],
  '7': ['▀▀█', '  █', '  ▀'],
  '8': ['█▀█', '█▀█', '▀▀▀'],
  '9': ['█▀█', '▀▀█', '▀▀▀'],
  '+': [' ▄ ', '▀█▀', '   '],
  '-': ['   ', '▀▀▀', '   '],
}

/** The /bankroll titles, by lifetime P&L: the first whose ceiling it is under. */
const RANKS = [
  { under: -500, title: 'Generous donor to the house' },
  { under: 0, title: 'Intern gambler' },
  { under: 250, title: 'Weekend punter' },
  { under: 1000, title: 'Card counter' },
] as const

/** What the house says over the band, one per settled run, in turn. */
const TAUNTS = [
  'The house has seen your test suite. The house is confident.',
  'Past performance does not predict future flakiness.',
  'The house reminds you: it works on my machine is not a strategy.',
  'Fun fact: the house has never once written a test.',
  'Bold of you to assume the mocks are mocking.',
  'The house accepts credits, not excuses.',
  'Somewhere, a snapshot test is quietly updating itself.',
  'Every red run funds a green run. That is the economy.',
] as const

const RAN: Record<Outcome, string> = {
  pass: 'passed',
  fail: 'failed',
  void: 'gave no result',
}

/** What the toast says when a bet settles: the run, then what came back. */
export function toastOf(stamp: Omit<Stamp, 'id'>): string {
  if (stamp.outcome === 'void') {
    return `· REFUNDED. The run gave no result, ${dollars(stamp.stake)} back.`
  }

  return stamp.delta > 0
    ? `✓ CASHED OUT. Tests ${RAN[stamp.outcome]}, +${dollars(stamp.delta)}.`
    : `✕ BUSTED. Tests ${RAN[stamp.outcome]}, -${dollars(stamp.stake)}.`
}

/** The band's big line for a settled bet, and the theme color it is drawn in. */
export function stampOf(stamp: Omit<Stamp, 'id'>): { text: string; color: 'success' | 'error' | 'warning' } {
  if (stamp.outcome === 'void') {
    return { text: ` REFUNDED ${stamp.stake} `, color: 'warning' }
  }

  return stamp.delta > 0
    ? { text: ` (\$) CASHED OUT ${stamp.paid} (${signed(stamp.delta)}) (\$) `, color: 'success' }
    : { text: ` BUSTED -${stamp.stake} `, color: 'error' }
}

/** A signed amount in block characters, three rows; characters it has no glyph for are skipped. */
export function bannerOf(text: string): [string, string, string] {
  const glyphs = [...text].map(char => GLYPHS[char]).filter(glyph => glyph !== undefined)
  const rowOf = (row: 0 | 1 | 2) => glyphs.map(glyph => glyph[row]).join(' ')

  return [rowOf(0), rowOf(1), rowOf(2)]
}

/** The amount a settled bet's banner shows: what the bankroll gained or lost on it. */
export function bannerAmountOf(stamp: Omit<Stamp, 'id'>): string {
  return stamp.outcome === 'void' ? '0' : signed(stamp.delta)
}

/** The streak as the band shows it, or null under two in a row. */
export function streakOf(streak: number): string | null {
  if (streak >= 2) {
    return `${streak} wins in a row`
  }

  return streak <= -2 ? `${-streak} losses in a row` : null
}

/** The band's first line: the run in flight, or the last one and the next. */
export function headlineOf(market: Market): string {
  if (market.isRunning) {
    return `Tests running: ${shortened(market.command)}. Will they pass?`
  }

  const last = market.last === null ? '' : `Last run ${RAN[market.last]}. `

  return `${last}Next test run: will they pass?`
}

/** The house's line over the band for a project with this many settled runs. */
export function tauntOf(runs: number): string {
  return TAUNTS[runs % TAUNTS.length] ?? TAUNTS[0]
}

/** Odds as the band shows them: `x1.90`. */
export function priceOf(multiplier: number): string {
  return `x${multiplier.toFixed(2)}`
}

/** A signed whole number: `+90`, `-100`, `0`. */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

/** The title /bankroll gives a bankroll: fresh meat before any decided bet, then by P&L. */
export function rankOf(bank: Bank): string {
  if (bank.wins + bank.losses === 0) {
    return 'Fresh meat'
  }

  return RANKS.find(rank => bank.pnl < rank.under)?.title ?? 'The House'
}

/** The rank above a bankroll's and the lifetime P&L it starts at; null at the top, and for fresh meat. */
export function nextRankOf(bank: Bank): { title: string; at: number } | null {
  if (bank.wins + bank.losses === 0) {
    return null
  }

  const index = RANKS.findIndex(rank => bank.pnl < rank.under)
  if (index === -1) {
    return null
  }

  return { title: RANKS[index + 1]?.title ?? 'The House', at: RANKS[index]?.under ?? 0 }
}

/** The longest run of wins as /bankroll reads it. */
export function bestStreakOf(best: number): string {
  if (best === 0) {
    return 'none yet'
  }

  return best === 1 ? '1 win' : `${best} wins in a row`
}

/** The settled bets line of /bankroll. */
export function recordOf(bank: Bank): string {
  const settled = bank.wins + bank.losses + bank.voids
  const decided = bank.wins + bank.losses
  const rate = decided === 0 ? 'no decided bets' : `win rate ${Math.round((bank.wins / decided) * 100)}%`

  return `Bets: ${settled} settled, ${bank.wins} won, ${bank.losses} lost, ${bank.voids} void (${rate})`
}

/** One row of /bankroll's recent bets. */
export function betLineOf(bet: Bet): string {
  const outcome = bet.outcome === 'void' ? 'void' : RAN[bet.outcome]

  return `${signed(bet.delta)}  ${bet.side} at ${priceOf(bet.multiplier)}, ${outcome}: ${shortened(bet.command)}`
}

/** Credits as the mod writes money: `$1,197`. */
function dollars(credits: number): string {
  return `$${String(credits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function shortened(command: string): string {
  const line = command.replace(/\s+/g, ' ').trim()

  return line.length > COMMAND_SHOWN ? `${line.slice(0, COMMAND_SHOWN)}...` : line
}

/** What the person is told when the store was saved in a layout this release does not read. */
export const NEWER_LAYOUT = 'This bankroll was saved by a newer pass-or-bust. Update the mod; nothing was changed.'
