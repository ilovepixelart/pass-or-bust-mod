import type { Bank, Slip } from '../../types'
import Bankroll from '../bankroll'
import type { History } from '../odds'

export const BANK_KEY = 'bank'
export const SLIP_KEY = 'slip'

/** The store key a project's test record lives under, one per directory. */
export function historyKeyOf(cwd: string | null): string {
  return cwd === null ? 'history' : `history:${cwd}`
}

/** A stored bankroll, or a new one where the store holds none it can read. */
export function bankOf(stored: unknown): Bank {
  return isRecord(stored) && isCount(stored.balance) && Array.isArray(stored.recent)
    ? { ...Bankroll.NEW_BANK, ...stored }
    : Bankroll.NEW_BANK
}

/** A stored open bet, or null where the store holds none it can read. */
export function slipOf(stored: unknown): Slip | null {
  const isSlip =
    isRecord(stored) &&
    (stored.side === 'pass' || stored.side === 'fail') &&
    isCount(stored.stake) &&
    typeof stored.multiplier === 'number'

  return isSlip ? (stored as Slip) : null
}

/** A stored test record, or an empty one where the store holds none it can read. */
export function historyOf(stored: unknown): History {
  return isRecord(stored) && isCount(stored.passes) && isCount(stored.fails)
    ? { passes: stored.passes, fails: stored.fails }
    : { passes: 0, fails: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
