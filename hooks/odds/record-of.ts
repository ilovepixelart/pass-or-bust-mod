import type { Outcome } from '../settle'
import type { History } from './history'

/** A project's record with one more settled run; a void run is not counted. */
export function recordOf(history: History, outcome: Outcome): History {
  if (outcome === 'void') {
    return history
  }

  return outcome === 'pass'
    ? { ...history, passes: history.passes + 1 }
    : { ...history, fails: history.fails + 1 }
}
