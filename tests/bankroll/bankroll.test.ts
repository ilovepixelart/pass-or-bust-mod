import { describe, expect, test, tier } from 'claude-code/testing'

import Bankroll from '../../hooks/bankroll'

tier('user')

describe('bankroll', () => {
  test('a new bankroll holds 1000 credits and no history', () => {
    expect(Bankroll.NEW_BANK).toEqual({
      balance: 1000,
      pnl: 0,
      wins: 0,
      losses: 0,
      voids: 0,
      bailouts: 0,
      streak: 0,
      bestStreak: 0,
      recent: [],
    })
  })

  test('a won, a lost and a void bet add up by hand', () => {
    const first = Bankroll.placeBet(Bankroll.NEW_BANK, 'pass', 1.9)
    expect(first?.bank.balance, 'the stake is held as soon as the bet is placed').toBe(900)

    const won = Bankroll.settleSlip(first!.bank, first!.slip, 'pass', 'npm test')
    expect(won.delta, '100 at 1.90 pays 190: 90 up').toBe(90)
    expect(won.bank.balance).toBe(1090)

    const second = Bankroll.placeBet(won.bank, 'fail', 2.85)
    const lost = Bankroll.settleSlip(second!.bank, second!.slip, 'pass', 'npm test')
    expect(lost.delta).toBe(-100)
    expect(lost.bank.balance).toBe(990)

    const third = Bankroll.placeBet(lost.bank, 'pass', 1.42)
    const voided = Bankroll.settleSlip(third!.bank, third!.slip, 'void', 'npm test')
    expect(voided.delta, 'a void hands the stake back').toBe(0)

    expect(voided.bank).toEqual({
      balance: 990,
      pnl: -10,
      wins: 1,
      losses: 1,
      voids: 1,
      bailouts: 0,
      streak: -1,
      bestStreak: 1,
      recent: [
        // each bet keeps the bankroll it left: 1090 after the win, 990 after the loss and the void
        { side: 'pass', stake: 100, multiplier: 1.42, outcome: 'void', delta: 0, command: 'npm test', balance: 990 },
        { side: 'fail', stake: 100, multiplier: 2.85, outcome: 'pass', delta: -100, command: 'npm test', balance: 990 },
        { side: 'pass', stake: 100, multiplier: 1.9, outcome: 'pass', delta: 90, command: 'npm test', balance: 1090 },
      ],
    })
  })

  test('wins in a row count up, a loss counts down from zero, a void leaves the streak alone', () => {
    const outcomes = ['pass', 'pass', 'pass', 'void', 'fail', 'fail', 'pass'] as const
    const streaks: number[] = []
    let bank = Bankroll.NEW_BANK

    for (const outcome of outcomes) {
      const placed = Bankroll.placeBet(bank, 'pass', 1.9)!
      bank = Bankroll.settleSlip(placed.bank, placed.slip, outcome, 'npm test').bank
      streaks.push(bank.streak)
    }

    expect(streaks).toEqual([1, 2, 3, 3, -1, -2, 1])
    expect(bank.bestStreak, 'the longest run of wins is kept').toBe(3)
  })

  test('a winning bet on a fail pays at its own odds', () => {
    const placed = Bankroll.placeBet(Bankroll.NEW_BANK, 'fail', 2.85)
    const won = Bankroll.settleSlip(placed!.bank, placed!.slip, 'fail', 'pytest')

    expect(won.delta, '100 at 2.85 pays 285: 185 up').toBe(185)
    expect(won.bank.balance).toBe(1185)
  })

  test('a win pays to the credit the odds show, whatever floating point makes of them', () => {
    // 100 at 1.13 is 113 by hand; 100 * 1.13 is 112.99999999999999 in floating point
    const placed = Bankroll.placeBet(Bankroll.NEW_BANK, 'pass', 1.13)
    const won = Bankroll.settleSlip(placed!.bank, placed!.slip, 'pass', 'pytest')

    expect(won.delta).toBe(13)
  })

  test('a bankroll below one stake cannot bet, and only then can it take a bailout', () => {
    const broke = { ...Bankroll.NEW_BANK, balance: 99, pnl: -901 }

    expect(Bankroll.placeBet(broke, 'pass', 1.9)).toBeNull()
    expect(Bankroll.bailout(broke)).toEqual({ ...broke, balance: 1000, bailouts: 1 })

    const solvent = { ...Bankroll.NEW_BANK, balance: 100 }
    expect(Bankroll.placeBet(solvent, 'pass', 1.9)?.bank.balance).toBe(0)
    expect(Bankroll.bailout(solvent)).toEqual(solvent)
  })

  test('recent bets keep the newest fifteen, newest first: one bar each on the /bankroll chart', () => {
    let bank = Bankroll.NEW_BANK

    for (let round = 1; round <= 17; round += 1) {
      const placed = Bankroll.placeBet(bank, 'pass', 1.9)!
      bank = Bankroll.settleSlip(placed.bank, placed.slip, 'void', `run ${round}`).bank
    }

    expect(bank.recent.map(bet => bet.command)).toEqual([
      'run 17', 'run 16', 'run 15', 'run 14', 'run 13',
      'run 12', 'run 11', 'run 10', 'run 9', 'run 8',
      'run 7', 'run 6', 'run 5', 'run 4', 'run 3',
    ])
  })
})
