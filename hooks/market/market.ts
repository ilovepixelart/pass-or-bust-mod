import type { Bank, Market, Side, Slip, Stamp } from '../../types'
import Bankroll from '../bankroll'
import type { Outcome } from '../settle'
import Words from '../words'

/** What the band's buttons and a settlement read and write together. */
export type Table = { market: Market | null; slip: Slip | null; bank: Bank }

/** The bankroll and open bet after a change, to save. */
export type Change = { bank: Bank; slip: Slip | null }

/** What a band button asks for. */
export type Action = 'bet-pass' | 'bet-fail' | 'cancel' | 'bailout'

/**
 * What a band button changes, or null when the moment does not allow it: a
 * bet needs a market, no open bet and a stake in the bankroll; a cancel needs
 * an open bet and no run in flight; a bailout needs a bankroll below a stake.
 */
export function changeOf(table: Table, action: Action): Change | null {
  if (action === 'bailout') {
    const bank = Bankroll.bailout(table.bank)

    return bank === table.bank ? null : { bank, slip: table.slip }
  }

  if (action === 'cancel') {
    return cancelOf(table)
  }

  return betOf(table, action === 'bet-pass' ? 'pass' : 'fail')
}

/**
 * How a finished run settles the open bet: the bankroll after it and the
 * toast that says so, or null with no bet open.
 */
export function settlementOf(
  table: Table,
  outcome: Outcome,
  command: string,
): (Change & { toast: string; stamp: Omit<Stamp, 'id'> }) | null {
  if (table.slip === null) {
    return null
  }

  const settled = Bankroll.settleSlip(table.bank, table.slip, outcome, command)
  const stake = table.slip.stake
  const stamp = { outcome, stake, paid: stake + settled.delta, delta: settled.delta }

  return { bank: settled.bank, slip: null, toast: Words.toastOf(stamp), stamp }
}

function betOf(table: Table, side: Side): Change | null {
  if (table.market === null || table.slip !== null) {
    return null
  }

  return Bankroll.placeBet(table.bank, side, table.market.odds[side])
}

function cancelOf(table: Table): Change | null {
  if (table.slip === null || table.market?.isRunning === true) {
    return null
  }

  return {
    bank: { ...table.bank, balance: table.bank.balance + table.slip.stake },
    slip: null,
  }
}

