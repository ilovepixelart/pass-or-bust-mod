import type { On } from 'claude-code'

/**
 * Answers what the engine answers beneath the plugin at a session's start and
 * for its sites: the session itself, a command's registration, a pane's
 * opening, and an empty drawing where the engine would draw its own.
 */
export function inSession(on: On, opened?: unknown[]): void {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', ($, e) => {
    opened?.push(e)

    return { value: { isPlaced: true } }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
}
