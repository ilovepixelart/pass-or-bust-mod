import type { ClientModule } from 'claude-code'

import { BAR_MS, barsOf, chartTree } from '../views/chart'
import type { ChartProps } from '../views/chart'

/** The /bankroll chart, drawn in one bar at a time on the drawing's own frame clock. */
const Chart: ClientModule<ChartProps, number> = (props, surface) => {
  if (surface.state === undefined) {
    surface.setState(1)
    const stop = surface.every(BAR_MS, () => {
      const shown = Math.min((surface.state ?? 0) + 1, barsOf(props))
      if (shown >= barsOf(props)) {
        stop()
      }
      surface.setState(shown)
    })
  }

  return chartTree(surface.elements, props, surface.state ?? 1)
}

export default Chart
