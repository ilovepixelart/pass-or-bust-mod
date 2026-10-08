import { describe, expect, test, tier } from 'claude-code/testing'

import Settle from '../../hooks/settle'
import Fixtures from '../fixtures'
import { RUNNER_OUTPUT } from '../fixtures/runner-output'

tier('user')

describe('outcome-of', () => {
  test('exit code 0 is a pass', () => {
    expect(Settle.outcomeOf(Fixtures.PASSED)).toBe('pass')
  })

  test('a non-zero exit code is a fail', () => {
    expect(Settle.outcomeOf(Fixtures.FAILED)).toBe('fail')
  })

  test('a run that never reached an exit code is void', () => {
    expect(Settle.outcomeOf(Fixtures.INTERRUPTED)).toBe('void')
    expect(Settle.outcomeOf(Fixtures.TIMED_OUT)).toBe('void')
    expect(Settle.outcomeOf(Fixtures.DENIED)).toBe('void')
  })

  test('a run the person interrupted is void, though core reports the exit code of the killed process', () => {
    expect(Settle.outcomeOf(Fixtures.ESCAPED)).toBe('void')
    // a runner that traps the interrupt and exits 1 is still a run the person cut short
    expect(Settle.outcomeOf({ ref: 1, result: 'Error: Exit code 1', text: 'Exit code 1\n[Request interrupted by user for tool use]', isError: true })).toBe('void')
  })

  test('a runner killed by a signal (exit code 128 and up) never reported a result: void', () => {
    expect(Settle.outcomeOf(Fixtures.KILLED)).toBe('void')
    // the boundary: 127 (command not found) is the shell's own failure, still a fail; 128 is the first signal code
    expect(Settle.outcomeOf({ ref: 1, result: 'Error: Exit code 127', text: 'Exit code 127', isError: true })).toBe('fail')
    expect(Settle.outcomeOf({ ref: 1, result: 'Error: Exit code 128', text: 'Exit code 128', isError: true })).toBe('void')
  })

  test('a piped run the person interrupted is void, even with a summary in what it printed', () => {
    const escaped = {
      ref: 1,
      result: { stdout: RUNNER_OUTPUT.bun.fail.output, stderr: '', interrupted: false },
      text: 'Exit code 145\n[Request interrupted by user for tool use]',
      isError: true as const,
    }

    expect(Settle.pipedOutcomeOf(escaped, 'bun')).toBe('void')
  })

  test("a piped run settles on its output's summary, whatever the pipe's exit code", () => {
    const failing = Fixtures.pipedResult(RUNNER_OUTPUT.bun.fail.output)
    const passing = Fixtures.pipedResult(RUNNER_OUTPUT.pytest.pass.output)

    expect(Settle.pipedOutcomeOf(failing, 'bun')).toBe('fail')
    expect(Settle.pipedOutcomeOf(passing, 'any')).toBe('pass')
  })

  test('a filtered run settles only on a summary a filter cannot half-hide', () => {
    const goKept = Fixtures.pipedResult('ok  \tdemo/a\t0.10s')

    expect(Settle.pipedOutcomeOf(Fixtures.pipedResult(RUNNER_OUTPUT.node.fail.output), 'any', true)).toBe('fail')
    expect(Settle.pipedOutcomeOf(goKept, 'any')).toBe('pass')
    expect(Settle.pipedOutcomeOf(goKept, 'any', true)).toBe('void')
  })

  test('a piped run with no summary in its output is void', () => {
    expect(Settle.pipedOutcomeOf(Fixtures.pipedResult('3 files changed'), 'any')).toBe('void')
  })

  test('a piped run that never finished is void, even if a summary is in its output', () => {
    const interrupted = Fixtures.pipedResult(RUNNER_OUTPUT.bun.pass.output, { interrupted: true })

    expect(Settle.pipedOutcomeOf(interrupted, 'bun')).toBe('void')
    expect(Settle.pipedOutcomeOf(Fixtures.DENIED, 'bun')).toBe('void')
  })

  test('a piped summary written to stderr still counts: bun prints its summary there', () => {
    const ran = Fixtures.pipedResult(RUNNER_OUTPUT.bun.fail.output, { stream: 'stderr' })

    expect(Settle.pipedOutcomeOf(ran, 'bun')).toBe('fail')
  })
})
