import type { ClientModule } from 'claude-code'

import { postDueOf, showMsOf, slotsTree } from '../views/slots'
import type { SlotsPost, SlotsProps } from '../views/slots'

/** One frame of the machine's own clock. */
const TICK_MS = 40

/** Kept across redraws: the latest props, when the run was seen to settle, what it has told the host, and the clock's off switch. */
type Live = { props: SlotsProps; settledAt: number | null; sent: Set<SlotsPost['event']>; stop: (() => void) | null }

/**
 * The slot machine: reels spinning on the drawing's frame clock while the
 * tests run. The hooks module hands it the settled result as new props; the
 * reels then stop on that result, and the tally and stamp play. It reads the
 * outcome and decides nothing.
 */
const Machine: ClientModule<SlotsProps, { time: number; live: Live }> = (props, surface) => {
  if (surface.state === undefined) {
    const live: Live = { props, settledAt: null, sent: new Set(), stop: null }
    surface.setState({ time: 0, live })
    live.stop = surface.every(TICK_MS, () => {
      const state = surface.state
      if (state === undefined) {
        return
      }
      const time = state.time + TICK_MS
      const { result } = state.live.props
      if (result !== null && state.live.settledAt === null) {
        state.live.settledAt = time
      }
      // the host holds the result and the toast for these: one post a frame, each event once
      const due = postDueOf(state.live.props, { time, settledAt: state.live.settledAt }, state.live.sent)
      if (due !== null) {
        state.live.sent.add(due.event)
        surface.post(due)
      }
      if (state.live.settledAt !== null && time > state.live.settledAt + showMsOf(result?.payout ?? null)) {
        state.live.stop?.()
      }
      surface.setState({ time, live: state.live })
    })
  }

  const state = surface.state
  if (state !== undefined) {
    state.live.props = props
  }

  return slotsTree(surface.elements, props, { time: state?.time ?? 0, settledAt: state?.live.settledAt ?? null })
}

export default Machine
