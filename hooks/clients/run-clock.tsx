import type { ClientModule } from 'claude-code'

import Art from '../art'

/**
 * The band's run timer: seconds since the run's market opened, on the
 * drawing's own frame clock, so it ticks without a redraw of the band.
 */
const RunClock: ClientModule<null, number> = (_, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState(0)
    surface.every(1000, () => surface.setState((surface.state ?? 0) + 1))
  }

  return <Text dimColor>{Art.clockOf(surface.state ?? 0)}</Text>
}

export default RunClock
