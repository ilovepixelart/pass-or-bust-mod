import type { ToolCallResult } from 'claude-code'

import { summaryOf } from '../summary'
import type { Family } from '../summary'
import type { Outcome } from './outcome'

const EXIT_CODE = /^Exit code ([1-9]\d*)/

/** The first exit code a shell reports for a process a signal killed (128 + the signal). */
const SIGNALLED = 128

/** What core adds to a Bash result when the person pressed Escape on it. */
const INTERRUPT_MARK = '[Request interrupted by user'

/**
 * How a test run settles, read from what core answered the Bash call.
 *
 * Core answers a non-zero exit with `isError` and the text `Exit code N`; any
 * other error (a timeout, a refusal), an interrupted run and a runner killed
 * by a signal (exit code 128 and up) never reported a result, so their bets
 * are void and their stakes go back.
 *
 * @param ran what `next(e)` resolved to for the Bash call
 * @returns `pass`, `fail` or `void`
 */
export function outcomeOf(ran: ToolCallResult): Outcome {
  if (ran.deny !== undefined) {
    return 'void'
  }

  if (ran.isError === true) {
    const code = Number(EXIT_CODE.exec(ran.text ?? '')?.[1] ?? 0)
    // killed by the person or by a signal: the runner never reported a result
    const isCut = wasInterrupted(ran) || code >= SIGNALLED

    return code > 0 && !isCut ? 'fail' : 'void'
  }

  return isInterrupted(ran.result) ? 'void' : 'pass'
}

/**
 * How a piped test run settles: from the summary in its output, since the
 * pipe's exit code is the last command's, not the tests'.
 *
 * A refused or interrupted run is void whatever it printed.
 *
 * @param ran what `next(e)` resolved to for the Bash call
 * @param family the runner the command named, or `any`
 * @returns `pass`, `fail` or `void`
 */
export function pipedOutcomeOf(ran: ToolCallResult, family: Family | 'any'): Outcome {
  if (ran.deny !== undefined || isInterrupted(ran.result) || wasInterrupted(ran)) {
    return 'void'
  }

  return summaryOf(outputOf(ran), family)
}

/** What the run printed: stdout and stderr from core's record, else the answer's text. */
function outputOf(ran: ToolCallResult): string {
  const record = ran.result
  if (typeof record === 'object' && record !== null && 'stdout' in record) {
    const { stdout, stderr } = record as { stdout?: unknown; stderr?: unknown }

    return [stdout, stderr].filter(part => typeof part === 'string').join('\n')
  }

  return typeof record === 'string' ? record : ran.text ?? ''
}

function isInterrupted(record: unknown): boolean {
  return (
    typeof record === 'object' &&
    record !== null &&
    'interrupted' in record &&
    record.interrupted === true
  )
}

/** Whether the person pressed Escape on the run: core marks the answer's text. */
function wasInterrupted(ran: ToolCallResult): boolean {
  return (ran.text ?? '').includes(INTERRUPT_MARK)
}
