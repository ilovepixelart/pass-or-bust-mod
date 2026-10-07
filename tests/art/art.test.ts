import { describe, expect, test, tier } from 'claude-code/testing'

import Art from '../../hooks/art'

tier('user')

describe('art', () => {
  test('a stamp draws ANSI Shadow letters six rows tall, side by side', () => {
    // O in ANSI Shadow, as figlet draws it: two of them, no gap between
    const O = [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ ']

    expect(Art.stampRowsOf('OO')).toEqual(O.map(row => row + row))
  })

  test('a stamp revealed letter by letter keeps its full width, blank where letters are still to come', () => {
    const whole = Art.stampRowsOf('BUSTED')
    const partly = Art.stampRowsOf('BUSTED', 2)

    // B is 8 columns, U 9: the first 17 columns drawn, the rest blank
    expect(partly[0]).toBe(`${'██████╗ '}${'██╗   ██╗'}${' '.repeat((whole[0]?.length ?? 0) - 17)}`)
    expect(partly.every(row => row.length === whole[0]?.length)).toBe(true)
  })

  test('every word the band stamps has a glyph for every letter', () => {
    for (const word of ['CASHED OUT', 'BUSTED', 'REFUNDED']) {
      expect(Art.stampRowsOf(word).every(row => row.trim().length > 0), word).toBe(true)
      expect(() => Art.stampRowsOf(word), word).not.toThrow()
    }
  })

  test('a stamp row splits into solid runs and shadow runs; spaces have no color and join the run they follow', () => {
    // C's first row: a space and six blocks, then the shadow corner
    expect(Art.runsOf(' ██████╗')).toEqual([
      { text: ' ██████', isShadow: false },
      { text: '╗', isShadow: true },
    ])
    // B's third row: blocks, shadow, blocks, shadow
    expect(Art.runsOf('██████╔╝ ██')).toEqual([
      { text: '██████', isShadow: false },
      { text: '╔╝ ', isShadow: true },
      { text: '██', isShadow: false },
    ])
  })

  test('a gauge is a continuous bar with an eighth-block end and a rule for the rest', () => {
    // 10 cells at 0.55: 44 eighths, 5 full cells and a half cell, 4 cells of rule
    expect(Art.gaugeOf(0.55, 10)).toEqual({ filled: '█████▌', rest: '────' })
    expect(Art.gaugeOf(0, 4)).toEqual({ filled: '', rest: '────' })
    expect(Art.gaugeOf(1, 4)).toEqual({ filled: '████', rest: '' })
    expect(Art.gaugeOf(1.7, 4), 'held at full').toEqual({ filled: '████', rest: '' })
  })

  test('a chart floors its bars below the lowest value, colors them by the start, and rules the start', () => {
    // 900 to 1100, floor 900 - 15% of 200 = 870, 16 eighths over 230:
    // 1000 is 9 eighths, 900 is 2, 1100 is 16; the start's row is the top one
    expect(Art.chartOf([1000, 900, 1100], 2, 1000)).toEqual([
      [
        { text: '▁▁ ', tone: 'up' },
        { text: '┄┄┄', tone: 'rule' },
        { text: '██ ', tone: 'up' },
      ],
      [
        { text: '██ ', tone: 'up' },
        { text: '▂▂ ', tone: 'down' },
        { text: '██ ', tone: 'up' },
      ],
    ])
  })

  test('the lowest bar is never empty', () => {
    const [, bottom] = Art.chartOf([500, 1500], 2, 1000)

    expect(bottom?.[0]?.text.trim().length).toBeGreaterThan(0)
  })

  test('a flat chart draws every bar full, not a division by zero', () => {
    expect(Art.chartOf([1000, 1000], 1, 1000)).toEqual([
      [
        { text: '██ ', tone: 'up' },
        { text: '██ ', tone: 'up' },
      ],
    ])
  })

  test('balances read off the bets, oldest first, the balance each bet left', () => {
    const bets = [
      { delta: -100, balance: 990 },
      { delta: 90, balance: 1090 },
      { delta: -100, balance: 1000 },
    ]

    expect(Art.balancesOf(bets, 990)).toEqual([1000, 1090, 990])
  })

  test('a stored balance wins over working back: a bailout between two bets is not a bet', () => {
    // lost down to 40, bailed out to 1000, then won 90: 1090
    const bets = [{ delta: 90, balance: 1090 }, { delta: -100, balance: 40 }]

    expect(Art.balancesOf(bets, 1090)).toEqual([40, 1090])
  })

  test('a bet saved before balances were kept is worked back from the next one that has it', () => {
    const bets = [{ delta: -100, balance: 990 }, { delta: 90 }, { delta: -100 }]

    // 990 was left by the newest bet; before it 1090; before the +90, 1000
    expect(Art.balancesOf(bets, 990)).toEqual([1000, 1090, 990])
  })

  test('the run clock reads minutes and two-digit seconds', () => {
    expect(Art.clockOf(0)).toBe('0:00')
    expect(Art.clockOf(7)).toBe('0:07')
    expect(Art.clockOf(65)).toBe('1:05')
  })

  test('money is a dollar sign and thousands grouped', () => {
    expect(Art.moneyOf(990)).toBe('$990')
    expect(Art.moneyOf(1090)).toBe('$1,090')
    expect(Art.moneyOf(1234567)).toBe('$1,234,567')
    expect(Art.moneyOf(-1500)).toBe('-$1,500')
  })

  test('the counter eases out from the old bankroll to the new one and stops there', () => {
    expect(Art.countOf(900, 1090, 0)).toBe(900)
    // ease out at one half: 1 - 0.5^3 = 0.875 of the way, 900 + 166.25
    expect(Art.countOf(900, 1090, 0.5)).toBe(1066)
    expect(Art.countOf(900, 1090, 1)).toBe(1090)
    expect(Art.countOf(900, 1090, 2.5)).toBe(1090)
    expect(Art.countOf(1090, 990, 0.5)).toBe(1003)
  })

  test('a coin falls with ease-in after its stagger and lands as a full coin', () => {
    // coin 0 starts at once; at a quarter of its half-second fall it is still on the top row
    expect(Art.coinOf(0, 0.125)).toEqual({ row: 0, glyph: '•' })
    expect(Art.coinOf(0, 0.5)).toEqual({ row: 3, glyph: '●' })
    // coin 5 waits 5 x 0.04 before it moves
    expect(Art.coinOf(5, 0.2)).toBe(null)
    // 0.9 of the way: row round(0.81 x 3) = 2, glyph o
    expect(Art.coinOf(0, 0.45)).toEqual({ row: 2, glyph: 'o' })
  })
})
