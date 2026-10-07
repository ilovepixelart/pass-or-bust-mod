import { describe, expect, test, tier } from 'claude-code/testing'

import Bankroll from '../../hooks/bankroll'
import Views from '../../hooks/views'

tier('user')

const bet = (delta: number, balance: number) => ({
  side: 'pass' as const,
  stake: 100,
  multiplier: 1.9,
  outcome: delta > 0 ? ('pass' as const) : ('fail' as const),
  delta,
  command: 'npm test',
  balance,
})

describe('chart', () => {
  test('the chart starts from the bankroll before its first bet: one bet is two bars, one mark', () => {
    const props = Views.chartPropsOf({ ...Bankroll.NEW_BANK, balance: 1090, recent: [bet(90, 1090)] })

    // 1000 before the bet, 1090 after: the start is the lowest, so its row is the bottom one
    expect(props?.rows[0]?.map(cell => cell.text)).toEqual(['   ', '██ '])
    expect(props?.labels[0]?.trim()).toBe('$1,090')
    expect(props?.labels[6]?.trim()).toBe('$1,000')
    expect(props?.marks).toEqual(['win'])
  })

  test('the start between the highest and lowest gets its own label on its own row', () => {
    // 1000 to 900 to 1100, floored at 870 over 56 eighths: 1000 fills 32, so row 3 from the bottom, 3 from the top
    const props = Views.chartPropsOf({ ...Bankroll.NEW_BANK, balance: 1100, recent: [bet(200, 1100), bet(-100, 900)] })

    expect(props?.labels).toEqual(['$1,100', '      ', '      ', '$1,000', '      ', '      ', '  $900'])
  })

  test('a flat chart is labelled once, at the top', () => {
    const props = Views.chartPropsOf({ ...Bankroll.NEW_BANK, balance: 1000, recent: [{ ...bet(0, 1000), outcome: 'void' }] })

    expect(props?.labels.filter(label => label.trim() !== '')).toEqual(['$1,000'])
  })

  test('no bets, no chart', () => {
    expect(Views.chartPropsOf(Bankroll.NEW_BANK)).toBe(null)
  })
})
