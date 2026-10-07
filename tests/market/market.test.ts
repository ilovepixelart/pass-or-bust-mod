import { describe, expect, test, tier } from 'claude-code/testing'

import Bankroll from '../../hooks/bankroll'
import Market from '../../hooks/market'
import type { Market as MarketState, Slip } from '../../types'

tier('user')

const RUNNING: MarketState = {
  command: 'npm test',
  odds: { pass: 1.9, fail: 1.9 },
  passChance: 0.5,
  isRunning: true,
  runs: 0,
  last: null,
}

const SETTLED: MarketState = { ...RUNNING, isRunning: false, last: 'pass' }

const SLIP: Slip = { side: 'pass', stake: 100, multiplier: 1.9 }

describe('market', () => {
  test('a bet needs a market and no open bet', () => {
    const bank = Bankroll.NEW_BANK

    expect(Market.changeOf({ market: null, slip: null, bank }, 'bet-pass')).toBeNull()
    expect(Market.changeOf({ market: RUNNING, slip: SLIP, bank }, 'bet-fail')).toBeNull()
    expect(Market.changeOf({ market: RUNNING, slip: null, bank }, 'bet-fail')).toEqual({
      bank: { ...bank, balance: 900 },
      slip: { side: 'fail', stake: 100, multiplier: 1.9 },
    })
  })

  test('a cancel refunds a waiting bet and refuses one on a run in flight', () => {
    const bank = { ...Bankroll.NEW_BANK, balance: 900 }

    expect(Market.changeOf({ market: RUNNING, slip: SLIP, bank }, 'cancel')).toBeNull()
    expect(Market.changeOf({ market: SETTLED, slip: SLIP, bank }, 'cancel')).toEqual({
      bank: { ...bank, balance: 1000 },
      slip: null,
    })
  })

  test('a bailout is refused to a bankroll that can still bet', () => {
    expect(
      Market.changeOf({ market: SETTLED, slip: null, bank: Bankroll.NEW_BANK }, 'bailout'),
    ).toBeNull()
  })

  test('no open bet settles to nothing', () => {
    expect(
      Market.settlementOf({ market: SETTLED, slip: null, bank: Bankroll.NEW_BANK }, 'pass', 'npm test'),
    ).toBeNull()
  })
})
