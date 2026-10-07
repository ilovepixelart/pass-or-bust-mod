import type { Bank, Slip } from '../../types'
import Bankroll from '../bankroll'
import type { History } from '../odds'

export const BANK_KEY = 'bank'
export const SLIP_KEY = 'slip'

/** The store key that says which layout the rest of the store is saved in. */
export const LAYOUT_KEY = 'layout'
/** The layout this release reads and writes. */
export const LAYOUT = 1

/**
 * How to treat a store by the layout it was saved in: one with no layout is from before layouts and reads as
 * this layout does; a newer layout, or one this release cannot make sense of, must be neither read nor
 * overwritten.
 */
export function layoutOf(stored: unknown): 'legacy' | 'current' | 'unreadable' {
  if (stored === undefined) {
    return 'legacy'
  }

  return stored === LAYOUT ? 'current' : 'unreadable'
}

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
