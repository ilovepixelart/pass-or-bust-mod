import type { On, ToolCallResult } from 'claude-code'

/**
 * Answers Bash beneath the plugin, one call at a time, holding each until the
 * test releases it with the result core would have answered; `reached`
 * resolves once a call has come down to the tool.
 */
export function heldTool(on: On) {
  let release: (ran: ToolCallResult) => void = () => {}
  let arrive: () => void = () => {}
  let reached = new Promise<void>(resolve => {
    arrive = resolve
  })
  const commands: string[] = []

  on('tool.call', ($, e) => {
    commands.push(e.tool === 'Bash' ? e.command : e.tool)
    const answer = new Promise<ToolCallResult>(resolve => {
      release = resolve
    })
    arrive()

    return answer
  })

  return {
    commands,
    get reached() {
      return reached
    },
    release(ran: ToolCallResult) {
      reached = new Promise<void>(resolve => {
        arrive = resolve
      })
      release(ran)
    },
  }
}
