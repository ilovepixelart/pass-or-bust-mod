import { describe, expect, test, tier } from 'claude-code/testing'

import Odds from '../../hooks/odds'

tier('user')

describe('odds-of', () => {
  test('with no history both sides pay 1.90, an even chance less the edge', () => {
    expect(Odds.oddsOf({ passes: 0, fails: 0 })).toEqual({
      pass: 1.9,
      fail: 1.9,
    })
  })

  test('three passes and one fail make passing the favourite', () => {
    // chance of a pass (3 + 1) / (4 + 2) = 2/3: 0.95 / (2/3) = 1.425, 0.95 / (1/3) = 2.85
    expect(Odds.oddsOf({ passes: 3, fails: 1 })).toEqual({
      pass: 1.42,
      fail: 2.85,
    })
  })

  test('a long passing streak pins the favourite at the floor and caps the long shot', () => {
    // chance of a pass 99/100: 0.95 / 0.99 = 0.96 is raised to 1.01; 0.95 / 0.01 = 95 is cut to 50
    expect(Odds.oddsOf({ passes: 98, fails: 0 })).toEqual({
      pass: 1.01,
      fail: 50,
    })
  })

  test('the odds mirror when passes and fails swap', () => {
    const odds = Odds.oddsOf({ passes: 8, fails: 0 })
    const swapped = Odds.oddsOf({ passes: 0, fails: 8 })

    // chance 9/10: 0.95 / 0.9 = 1.0555 rounds down to 1.05, 0.95 / 0.1 = 9.5
    expect(odds).toEqual({ pass: 1.05, fail: 9.5 })
    expect(swapped).toEqual({ pass: odds.fail, fail: odds.pass })
  })
})
