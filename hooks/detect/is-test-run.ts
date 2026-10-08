import { isFilterable } from '../summary'
import type { Family } from '../summary'
import { LINE_FILTERS, PIPE_READERS, RUNNERS } from './runners'
import { stepsOf } from './steps'

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/** A grep flag that keeps part of a line: `-o`, or `-o` among others (`-oE`). */
const ONLY_MATCHING = /^-[A-Za-z]*o[A-Za-z]*$/

/**
 * A command that runs the tests: whose summary it prints, whether its exit code
 * is the tests', and whether a filter may have dropped lines of its output.
 */
export type TestRun = { family: Family | 'any'; isPiped: boolean; isFiltered: boolean }

/**
 * Whether a shell command runs the tests, and how its bet can settle.
 *
 * The command is cut into its steps at `&&`, `||`, `;` and newlines, quotes
 * and heredocs left whole. A step counts when, past any leading `NAME=value`
 * assignments, its words start with a runner's. Unpiped, its exit code settles
 * the bet. Piped, the exit code is the last command's, so the summary in the
 * output settles it: only a pipe through readers that keep the end of the
 * output (PIPE_READERS) or whole lines of it (LINE_FILTERS) counts, and a
 * filtered run only for a runner whose summary a filter cannot half-hide.
 *
 * @param command the Bash command as Claude wrote it
 * @returns the run, or null when no step runs a test runner it can settle
 */
export function testRunOf(command: string): TestRun | null {
  for (const [runs = '', ...readers] of stepsOf(command)) {
    const runner = runnerOf(runs)
    const isFiltered = readers.some(isLineFilter)

    if (runner !== undefined && readers.every(isPipeReader) && (!isFiltered || isFilterable(runner.family))) {
      return { family: runner.family, isPiped: readers.length > 0, isFiltered }
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

  // grep takes any unambiguous prefix of a long option: `--only` is `--only-matching`
  return LINE_FILTERS.includes(name) && !options.some(word => word.startsWith('--o') || ONLY_MATCHING.test(word))
}
