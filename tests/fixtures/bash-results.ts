import type { ToolCallResult } from 'claude-code'

/** What core answered a Bash call that exited 0, recorded from a real run. */
export const PASSED: ToolCallResult = {
  ref: 1,
  result: {
    stdout: '3 passed',
    stderr: '',
    interrupted: false,
    isImage: false,
    noOutputExpected: false,
  },
  text: '3 passed',
}

/** What core answered a Bash call that exited 3, recorded from a real run. */
export const FAILED: ToolCallResult = {
  ref: 1,
  result: 'Error: Exit code 3',
  text: 'Exit code 3',
  isError: true,
}

/** A Bash call the person interrupted: core's record says so. */
export const INTERRUPTED: ToolCallResult = {
  ref: 1,
  result: {
    stdout: '',
    stderr: '',
    interrupted: true,
    isImage: false,
    noOutputExpected: false,
  },
  text: '',
}

/**
 * What core answered when the person pressed Escape on a running `bun test`,
 * captured live on Claude Code 2.1.292: the killed process's exit code, and
 * the interrupt marker.
 */
export const ESCAPED: ToolCallResult = {
  ref: 1,
  result: 'Error: Exit code 145\n[Request interrupted by user for tool use]',
  text: 'Exit code 145\n[Request interrupted by user for tool use]',
  isError: true,
}

/** A runner killed by a signal (128 + 15, SIGTERM): it never reported a result. */
export const KILLED: ToolCallResult = {
  ref: 1,
  result: 'Error: Exit code 143',
  text: 'Exit code 143',
  isError: true,
}

/** A Bash call that errored for a reason other than its exit code. */
export const TIMED_OUT: ToolCallResult = {
  ref: 1,
  result: 'Command timed out after 2m',
  text: 'Command timed out after 2m',
  isError: true,
}

/** A Bash call refused before it ran. */
export const DENIED: ToolCallResult = { deny: 'not now' }

/**
 * What core answers a run piped through tail: exit 0 (tail's), the tests'
 * output in stdout, or in stderr for a runner that prints its summary there
 * and was piped without `2>&1`.
 */
export function pipedResult(
  output: string,
  { stream = 'stdout', interrupted = false }: { stream?: 'stdout' | 'stderr'; interrupted?: boolean } = {},
): ToolCallResult {
  return {
    ref: 1,
    result: {
      stdout: stream === 'stdout' ? output : '',
      stderr: stream === 'stderr' ? output : '',
      interrupted,
      isImage: false,
      noOutputExpected: false,
    },
    text: output,
  }
}
