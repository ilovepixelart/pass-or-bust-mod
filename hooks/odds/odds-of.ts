import Limits from '../limits'
import type { Odds } from '../../types'
import type { History } from './history'

/**
 * The odds a test-run market offers, from the project's settled runs.
 *
 * The chance of a pass is Laplace's rule, (passes + 1) / (runs + 2), so a
 * project with no history is an even chance. Each side pays the fair price
 * less the house edge, rounded down to the cent and held between the floor
 * and the cap.
 *
 * @param history the project's settled runs
 * @returns what one credit staked on each side pays back
 */
export function oddsOf(history: History): Odds {
  const passChance = passChanceOf(history)

  return {
    pass: priceOf(passChance),
    fail: priceOf(1 - passChance),
  }
}

/** The chance of a pass the odds are priced from: Laplace's rule over the project's settled runs. */
export function passChanceOf(history: History): number {
  return (history.passes + 1) / (history.passes + history.fails + 2)
}

function priceOf(chance: number): number {
  const fair = (1 - Limits.EDGE) / chance
  const cents = Math.floor(fair * 100 + 1e-9) / 100

  return Math.min(Limits.MAX_MULTIPLIER, Math.max(Limits.MIN_MULTIPLIER, cents))
}
