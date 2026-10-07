import type { Family } from '../summary'
import { PIPE_READERS, RUNNERS } from './runners'

const STEP_SEPARATOR = /&&|\|\||;|\n/
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/** A command that runs the tests: whose summary it prints, and whether its exit code is the tests'. */
export type TestRun = { family: Family | 'any'; isPiped: boolean }

/**
 * Whether a shell command runs the tests, and how its bet can settle.
 *
 * The command is cut into its steps at `&&`, `||`, `;` and newlines. A step
 * counts when, past any leading `NAME=value` assignments, its words start
 * with a runner's. Unpiped, its exit code settles the bet. Piped, the exit
 * code is the last command's, so only a pipe through readers that keep the
 * end of the output (PIPE_READERS) counts: the summary there settles it.
 *
 * @param command the Bash command as Claude wrote it
 * @returns the run, or null when no step runs a test runner it can settle
 */
export function testRunOf(command: string): TestRun | null {
  for (const step of command.split(STEP_SEPARATOR)) {
    const [runs = '', ...readers] = step.split('|')
    const runner = runnerOf(runs)

    if (runner !== undefined && readers.every(isPipeReader)) {
      return { family: runner.family, isPiped: readers.length > 0 }
    }
  }

  return null
}

/** Whether a shell command runs the tests in a way the house can settle. */
export function isTestRun(command: string): boolean {
  return testRunOf(command) !== null
}

function runnerOf(stage: string) {
  const words = stage.trim().split(/\s+/)
  const firstCommandWord = words.findIndex(word => !ASSIGNMENT.test(word))
  const command = words.slice(Math.max(firstCommandWord, 0))

  return RUNNERS.find(runner => runner.words.every((word, index) => command[index] === word))
}

function isPipeReader(stage: string): boolean {
  const [name = ''] = stage.trim().split(/\s+/)

  return PIPE_READERS.includes(name)
}
