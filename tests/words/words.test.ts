import { describe, expect, test, tier } from 'claude-code/testing'

import Bankroll from '../../hooks/bankroll'
import Words from '../../hooks/words'

tier('user')

describe('words', () => {
  const decided = { ...Bankroll.NEW_BANK, wins: 1, losses: 1 }

  test('a bankroll with no decided bets is fresh meat, whatever its balance', () => {
    expect(Words.rankOf({ ...Bankroll.NEW_BANK, voids: 2 })).toBe('Fresh meat')
  })

  test('one lost bet is enough to stop being fresh meat', () => {
    expect(Words.rankOf({ ...Bankroll.NEW_BANK, losses: 1, pnl: -100 })).toBe('Intern gambler')
  })

  test('the next rank up and the P&L it takes, from each side of a threshold', () => {
    // Weekend punter runs from 0 up to 250; Card counter from 250 to 1000; then The House
    expect(Words.nextRankOf({ ...decided, pnl: 249 })).toEqual({ title: 'Card counter', at: 250 })
    expect(Words.nextRankOf({ ...decided, pnl: 250 })).toEqual({ title: 'The House', at: 1000 })
    expect(Words.nextRankOf({ ...decided, pnl: -600 })).toEqual({ title: 'Intern gambler', at: -500 })
    expect(Words.nextRankOf({ ...decided, pnl: 1000 }), 'nothing above The House').toBe(null)
    expect(Words.nextRankOf(Bankroll.NEW_BANK), 'fresh meat moves up on its first decided bet').toBe(null)
  })

  test('the rank follows lifetime P&L, each threshold pinned on both sides', () => {
    const ranks = [-501, -500, -1, 0, 249, 250, 999, 1000].map(pnl => Words.rankOf({ ...decided, pnl }))

    expect(ranks).toEqual([
      'Generous donor to the house',
      'Intern gambler',
      'Intern gambler',
      'Weekend punter',
      'Weekend punter',
      'Card counter',
      'Card counter',
      'The House',
    ])
  })

  test('the best streak reads as wins in a row, or none yet', () => {
    expect(Words.bestStreakOf(0)).toBe('none yet')
    expect(Words.bestStreakOf(1)).toBe('1 win')
    expect(Words.bestStreakOf(3)).toBe('3 wins in a row')
  })

  test('a banner draws each character three rows tall, one column apart', () => {
    expect(Words.bannerOf('-1')).toEqual(['    ▀█ ', '▀▀▀  █ ', '    ▀▀▀'])
  })

  test('every banner row is as wide as the others', () => {
    const rows = Words.bannerOf('+1234567890')

    expect(rows.length).toBe(3)
    expect(new Set(rows.map(row => row.length)).size).toBe(1)
  })

})
