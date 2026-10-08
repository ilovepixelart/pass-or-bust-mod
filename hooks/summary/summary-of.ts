import type { Outcome } from '../settle'

/** The runners whose summary the house can read. */
export type Family = 'bun' | 'deno' | 'node' | 'go' | 'cargo' | 'pytest' | 'jest' | 'vitest'

/** A runner's reading of an output: its verdict, or null when its summary is not there whole. */
type Reader = (lines: readonly string[]) => 'pass' | 'fail' | null

const ANSI = /\u001b\[[0-9;]*m/g

const countOf = (line: string, word: string) => Number(new RegExp(`(\\d+) ${word}`).exec(line)?.[1] ?? 0)

/** Each runner's summary, read off the lines a real run prints last. */
const READERS: Record<Family, Reader> = {
  // ` 2 pass`, ` 1 fail`, then `Ran 2 tests across 1 file.`
  bun: lines => {
    const passes = lines.find(line => /^\s*\d+ pass$/.test(line))
    const fails = lines.find(line => /^\s*\d+ fail$/.test(line))
    if (passes === undefined || fails === undefined || !lines.some(line => /^Ran \d+ tests? across/.test(line))) {
      return null
    }

    return verdictOf(countOf(passes, 'pass'), countOf(fails, 'fail'))
  },
  // `ok | 2 passed | 0 failed (2ms)` or `FAILED | 1 passed | 1 failed (2ms)`
  deno: lines => {
    const line = lines.findLast(line => /^(ok|FAILED) \| \d+ passed .*\| \d+ failed/.test(line))

    return line === undefined ? null : verdictOf(countOf(line, 'passed'), countOf(line, 'failed'))
  },
  // `node --test` without a terminal prints TAP and ends with `# pass 1` and `# fail 1`
  node: lines => {
    const passes = lines.findLast(line => /^# pass \d+$/.test(line))
    const fails = lines.findLast(line => /^# fail \d+$/.test(line))
    if (passes === undefined || fails === undefined) {
      return null
    }

    // the count follows the word here: `# pass 2`
    return verdictOf(Number(passes.slice('# pass '.length)), Number(fails.slice('# fail '.length)))
  },
  // the last result line: `ok  <pkg> 0.1s`, `FAIL <pkg> 0.1s`, a `?  <pkg>` with no test
  // files, or the closing `FAIL`/`PASS`; never TAP's `ok 1 - name`, which other runners print
  go: lines => {
    const line = lines.findLast(
      line => /^(ok|FAIL)\s+\S+\s+(\(cached\)|[\d.]+s)(\s|$)/.test(line) || /^(PASS|FAIL)$/.test(line) || /^\?\s/.test(line),
    )
    if (line === undefined || line.startsWith('?') || line.includes('[no tests to run]')) {
      return null
    }

    return line.startsWith('FAIL') ? 'fail' : 'pass'
  },
  // `test result: ok. 2 passed; 0 failed; ...` per binary; `error: test failed` once one fails
  cargo: lines => {
    if (lines.some(line => /^error: (test failed|\d+ targets? failed)/.test(line))) {
      return 'fail'
    }
    const results = lines.filter(line => /^test result: (ok|FAILED)\. \d+ passed; \d+ failed/.test(line))
    if (results.length === 0) {
      return null
    }

    return verdictOf(
      results.reduce((sum, line) => sum + countOf(line, 'passed'), 0),
      results.reduce((sum, line) => sum + countOf(line, 'failed'), 0),
    )
  },
  // `===== 1 failed, 1 passed in 0.02s =====`, or `1 failed, 1 passed in 0.02s` under -q
  pytest: lines => {
    const line = lines.findLast(line => /^=*\s*(\d+ \w+(, )?)+ in [\d.]+s\b/.test(line))

    return line === undefined ? null : verdictOf(countOf(line, 'passed'), countOf(line, 'failed') + countOf(line, 'errors?'))
  },
  // `Tests:       1 failed, 1 passed, 2 total`
  jest: lines => {
    const line = lines.findLast(line => /^Tests:\s+.*\d+ total$/.test(line))

    return line === undefined ? null : verdictOf(countOf(line, 'passed'), countOf(line, 'failed'))
  },
  // `      Tests  1 failed | 1 passed (2)`
  vitest: lines => {
    const line = lines.findLast(line => /^\s*Tests\s+.*\(\d+\)$/.test(line))

    return line === undefined ? null : verdictOf(countOf(line, 'passed'), countOf(line, 'failed'))
  },
}

/**
 * How a test run settles, read from its output instead of its exit code: for
 * a piped run, whose exit code is the last command's, not the tests'.
 *
 * A pass needs the runner's whole summary with no failures and at least one
 * pass; a fail, a summary with failures. Anything else (no summary, a summary
 * cut short, a run of no tests, two runners disagreeing) is void.
 *
 * @param output what the run printed, stdout and stderr together
 * @param family the runner the command named, or `any` for one that names none (`npm test`)
 */
export function summaryOf(output: string, family: Family | 'any'): Outcome {
  const lines = output.replace(ANSI, '').split('\n').map(line => line.trimEnd())
  const families = family === 'any' ? (Object.keys(READERS) as Family[]) : [family]
  const verdicts = new Set(families.map(each => READERS[each](lines)).filter(verdict => verdict !== null))

  return verdicts.size === 1 ? [...verdicts][0] ?? 'void' : 'void'
}

function verdictOf(passed: number, failed: number): 'pass' | 'fail' | null {
  if (failed > 0) {
    return 'fail'
  }

  return passed > 0 ? 'pass' : null
}
