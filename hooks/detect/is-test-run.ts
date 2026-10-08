import { isFilterable } from '../summary'
import type { Family } from '../summary'
import { LINE_FILTERS, PIPE_READERS, RUNNERS } from './runners'
import { stepsOf } from './steps'
import type { Step } from './steps'

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/**
 * A grep flag a summary cannot be read through: `-o` keeps part of a line, and
 * `-v` drops the lines it names, a failing summary the likeliest; alone or
 * among others (`-oE`, `-vE`).
 */
const PARTIAL_OR_INVERTED = /^-[A-Za-z]*[ov][A-Za-z]*$/

/**
 * A command that runs the tests: whose summary it prints, whether its summary
 * settles it because its exit code is not the tests' (piped, or a command runs
 * after it), and whether a filter may have dropped lines of its output.
 */
export type TestRun = { family: Family | 'any'; settlesOnSummary: boolean; isFiltered: boolean }

/**
 * Whether a shell command runs the tests, and how its bet can settle.
 *
 * The command is cut into its steps at `&&`, `||`, `;`, a lone `&` and
 * newlines, quotes and heredocs left whole. A step counts when, past any
 * leading `NAME=value` assignments, its words start with a runner's, unless
 * `&` sent it to the background. When it is the last command, its exit code
 * settles the bet. Piped, or with a command after it, the exit code is
 * another command's, so the summary in the output settles it: only a pipe
 * through readers that keep the end of the output (PIPE_READERS) or whole
 * lines of it (LINE_FILTERS) counts, and a filtered run only for a runner
 * whose summary a filter cannot half-hide.
 *
 * @param command the Bash command as Claude wrote it
 * @returns the run, or null when no step runs a test runner it can settle
 */
export function testRunOf(command: string): TestRun | null {
  const steps = stepsOf(command)
  for (const [index, { stages, isBackground }] of steps.entries()) {
    const [runs = '', ...readers] = stages
    const runner = runnerOf(runs)
    const isFiltered = readers.some(isLineFilter)

    if (runner !== undefined && !isBackground && readers.every(isPipeReader) && (!isFiltered || isFilterable(runner.family))) {
      const isLast = steps.slice(index + 1).every(isBlank)

      return { family: runner.family, settlesOnSummary: readers.length > 0 || !isLast, isFiltered }
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

  return PIPE_READERS.includes(name) || isLineFilter(stage)
}

function isLineFilter(stage: string): boolean {
  const [name = '', ...options] = stage.trim().split(/\s+/)

  // grep takes any unambiguous prefix of a long option: `--only` is `--only-matching`, `--inv` is `--invert-match`
  return LINE_FILTERS.includes(name) && !options.some(word => word.startsWith('--o') || word.startsWith('--inv') || PARTIAL_OR_INVERTED.test(word))
}

/** A step that runs nothing: empty, or only a comment. */
function isBlank({ stages }: Step): boolean {
  const text = stages.join('|').trim()

  return text === '' || text.startsWith('#')
}
