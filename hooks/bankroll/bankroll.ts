import type { Bank, Bet, Side, Slip } from '../../types'
import Limits from '../limits'
import type { Outcome } from '../settle'

/** A bankroll nobody has bet from yet. */
export const NEW_BANK: Bank = {
  balance: Limits.START_BALANCE,
  pnl: 0,
  wins: 0,
  losses: 0,
  voids: 0,
  bailouts: 0,
  streak: 0,
  bestStreak: 0,
  recent: [],
}

/**
 * Places one stake on a side at the market's odds, holding the stake out of
 * the balance until the run settles.
 *
 * @returns the bankroll less the stake and the slip, or null when the
 *   balance is below one stake
 */
export function placeBet(
  bank: Bank,
  side: Side,
  multiplier: number,
): { bank: Bank; slip: Slip } | null {
  if (bank.balance < Limits.STAKE) {
    return null
  }

  return {
    bank: { ...bank, balance: bank.balance - Limits.STAKE },
    slip: { side, stake: Limits.STAKE, multiplier },
  }
}

/**
 * Settles a slip on a run's outcome: a win pays the stake times the odds,
 * rounded down; a loss keeps the stake; a void hands it back.
 *
 * @returns the settled bankroll and the bet's net effect on it
 */
export function settleSlip(
  bank: Bank,
  slip: Slip,
  outcome: Outcome,
  command: string,
): { bank: Bank; delta: number } {
  const paid = paidOf(slip, outcome)
  const delta = paid - slip.stake
  const bet: Bet = { ...slip, outcome, delta, command, balance: bank.balance + paid }
  const streak = streakAfter(bank.streak, outcome, delta)

  return {
    delta,
    bank: {
      ...bank,
      balance: bank.balance + paid,
      pnl: bank.pnl + delta,
      wins: bank.wins + (outcome !== 'void' && delta > 0 ? 1 : 0),
      losses: bank.losses + (outcome !== 'void' && delta < 0 ? 1 : 0),
      voids: bank.voids + (outcome === 'void' ? 1 : 0),
      streak,
      bestStreak: Math.max(bank.bestStreak, streak),
      recent: [bet, ...bank.recent].slice(0, Limits.RECENT_BETS),
    },
  }
}

/**
 * Refills a bankroll below one stake to the starting balance, counting it.
 * A bankroll that can still bet is returned as it is.
 */
export function bailout(bank: Bank): Bank {
  if (bank.balance >= Limits.STAKE) {
    return bank
  }

  return { ...bank, balance: Limits.START_BALANCE, bailouts: bank.bailouts + 1 }
}

function streakAfter(streak: number, outcome: Outcome, delta: number): number {
  if (outcome === 'void') {
    return streak
  }

  if (delta > 0) {
    return streak > 0 ? streak + 1 : 1
  }

  return streak < 0 ? streak - 1 : -1
}

/** What a slip pays back if its side comes in: the band's `pays $285`. */
export function paysOf(slip: Slip): number {
  return paidOf(slip, slip.side)
}

function paidOf(slip: Slip, outcome: Outcome): number {
  if (outcome === 'void') {
    return slip.stake
  }

  if (outcome !== slip.side) {
    return 0
  }

  // odds are whole cents: multiply in cents so 100 at 1.13 pays 113, not 112
  const multiplierCents = Math.round(slip.multiplier * 100)

  return Math.floor((slip.stake * multiplierCents) / 100)
}
