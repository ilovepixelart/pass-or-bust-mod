import type { ClientModule } from 'claude-code'

import { LETTER_MS, payoutDoneMs, payoutTree } from '../views/payout'
import type { PayoutProps } from '../views/payout'

/**
 * A settled bet's stamp, animated on the drawing's own frame clock: a dim
 * frame, the letters left to right, the coins falling, the bankroll counting.
 * The clock stops once it holds still.
 */
const Payout: ClientModule<PayoutProps, number> = (props, surface) => {
  if (surface.state === undefined) {
    surface.setState(0)
    const stop = surface.every(LETTER_MS, () => {
      const elapsed = Math.min((surface.state ?? 0) + LETTER_MS, payoutDoneMs(props))
      if (elapsed >= payoutDoneMs(props)) {
        stop()
      }
      surface.setState(elapsed)
    })
  }

  return payoutTree(surface.elements, props, surface.state ?? 0)
}

export default Payout
