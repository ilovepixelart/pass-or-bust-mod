import { describe, expect, test, tier } from 'claude-code/testing'

import Summary from '../../hooks/summary'
import type { Family } from '../../hooks/summary'
import { RUNNER_OUTPUT } from '../fixtures/runner-output'

tier('user')

/** What `tail -n count` leaves of an output. */
const tail = (output: string, count: number) => output.split('\n').slice(-count).join('\n')

const FAMILIES = Object.keys(RUNNER_OUTPUT) as Family[]

describe('summaryOf', () => {
  test('every runner on this machine: its real passing run is a pass, its real failing run a fail', () => {
    expect(FAMILIES.length, 'samples captured for every runner the parser knows').toBe(8)

    for (const family of FAMILIES) {
      const { pass, fail } = RUNNER_OUTPUT[family]
      expect(Summary.summaryOf(pass.output, family), `${family} pass`).toBe('pass')
      expect(Summary.summaryOf(fail.output, family), `${family} fail`).toBe('fail')
    }
  })

  test('a command whose runner is unknown (npm test) settles on whichever one summary it finds', () => {
    for (const family of FAMILIES) {
      const { pass, fail } = RUNNER_OUTPUT[family]
      expect(Summary.summaryOf(pass.output, 'any'), `${family} pass`).toBe('pass')
      expect(Summary.summaryOf(fail.output, 'any'), `${family} fail`).toBe('fail')
    }
  })

  test('tail -30, as Claude pipes it, keeps the summary: still settles', () => {
    for (const family of FAMILIES) {
      const { pass, fail } = RUNNER_OUTPUT[family]
      expect(Summary.summaryOf(tail(pass.output, 30), family), `${family} pass`).toBe('pass')
      expect(Summary.summaryOf(tail(fail.output, 30), family), `${family} fail`).toBe('fail')
    }
  })

  test('a tail that cuts into the summary is void, never a guess', () => {
    // bun prints ` N pass`, ` N fail`, ` N expect() calls`, `Ran N tests`: two lines keep neither count
    expect(Summary.summaryOf(tail(RUNNER_OUTPUT.bun.fail.output, 2), 'bun')).toBe('void')
    // jest's last line is `Ran all test suites.`: the Tests line is four up
    expect(Summary.summaryOf(tail(RUNNER_OUTPUT.jest.fail.output, 1), 'jest')).toBe('void')
    // vitest's Tests line is three from the end
    expect(Summary.summaryOf(tail(RUNNER_OUTPUT.vitest.fail.output, 2), 'vitest')).toBe('void')
    // cargo's last line on a failure is `error: test failed`: that alone says it failed
    expect(Summary.summaryOf(tail(RUNNER_OUTPUT.cargo.fail.output, 1), 'cargo')).toBe('fail')
  })

  test("another runner's summary does not settle a run of this one", () => {
    expect(Summary.summaryOf(RUNNER_OUTPUT.pytest.fail.output, 'bun')).toBe('void')
    expect(Summary.summaryOf(RUNNER_OUTPUT.jest.pass.output, 'cargo')).toBe('void')
    // vitest's summary line also starts with Tests: it is not jest's
    expect(Summary.summaryOf(RUNNER_OUTPUT.vitest.fail.output, 'jest')).toBe('void')
  })

  test('output with no summary in it is void', () => {
    expect(Summary.summaryOf('', 'any')).toBe('void')
    expect(Summary.summaryOf('Segmentation fault (core dumped)', 'any')).toBe('void')
    expect(Summary.summaryOf('bun test v1.4.2\nerror: Cannot find module "./setup"', 'bun')).toBe('void')
  })

  test('two runners disagreeing in one output is void', () => {
    const mixed = `${RUNNER_OUTPUT.jest.pass.output}\n${RUNNER_OUTPUT.pytest.fail.output}`

    expect(Summary.summaryOf(mixed, 'any')).toBe('void')
  })

  test('a run that ran no tests is void, not a pass', () => {
    expect(Summary.summaryOf('?   \tdemo\t[no test files]', 'go')).toBe('void')
    expect(Summary.summaryOf('============================ no tests ran in 0.01s ============================', 'pytest')).toBe('void')
    expect(Summary.summaryOf('test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out', 'cargo')).toBe('void')
  })

  test('pytest errors count as a fail, as pytest itself counts them', () => {
    expect(Summary.summaryOf('========================= 2 passed, 1 error in 0.20s =========================', 'pytest')).toBe('fail')
  })

  test('go: one failing package among passing ones fails the run', () => {
    const output = 'ok  \tdemo/a\t0.10s\nFAIL\tdemo/b\t0.20s\nok  \tdemo/c\t0.10s\nFAIL'

    expect(Summary.summaryOf(output, 'go')).toBe('fail')
  })

  test('color codes in the output change nothing', () => {
    // a terminal-colored bun summary wraps each count line in codes
    const colored = RUNNER_OUTPUT.bun.fail.output.replace(' 1 fail', '\u001b[31m 1 fail\u001b[0m')

    expect(Summary.summaryOf(colored, 'bun')).toBe('fail')
  })
})
