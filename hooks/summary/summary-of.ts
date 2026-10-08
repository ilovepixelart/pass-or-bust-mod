import type { Outcome } from '../settle'

/** The runners whose summary the house can read. */
export type Family = 'bun' | 'deno' | 'node' | 'go' | 'cargo' | 'pytest' | 'jest' | 'vitest'

/** A runner's reading of an output: its verdict, or null when its summary is not there whole. */
type Reader = (lines: readonly string[]) => 'pass' | 'fail' | null

// every CSI sequence: colors, and the erase-line `\u001b[K` grep --color puts inside a match
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g

const countOf = (line: string, word: string) => Number(new RegExp(`(\\d+) ${word}`).exec(line)?.[1] ?? 0)

const sumOf = (lines: readonly string[], count: (line: string) => number) => lines.reduce((sum, line) => sum + count(line), 0)

/**
 * The verdict over every summary line `pattern` finds, counts added up: an
 * output can hold several (a workspace runs one suite per package), and one
 * failing summary fails the run.
 */
function verdictOfAll(lines: readonly string[], pattern: RegExp, failed: (line: string) => number): 'pass' | 'fail' | null {
  const found = lines.filter(line => pattern.test(line))

  return found.length === 0 ? null : verdictOf(sumOf(found, line => countOf(line, 'passed')), sumOf(found, failed))
}

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
  deno: lines => verdictOfAll(lines, /^(ok|FAILED) \| \d+ passed .*\| \d+ failed/, line => countOf(line, 'failed')),
  // `node --test` without a terminal prints TAP and ends with `# pass 1` and `# fail 1`
  node: lines => {
    const passes = lines.filter(line => /^# pass \d+$/.test(line))
    const fails = lines.filter(line => /^# fail \d+$/.test(line))
    if (passes.length === 0 || fails.length === 0) {
      return null
    }

    // the count follows the word here: `# pass 2`
    return verdictOf(sumOf(passes, line => Number(line.slice('# pass '.length))), sumOf(fails, line => Number(line.slice('# fail '.length))))
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

    return verdictOf(sumOf(results, line => countOf(line, 'passed')), sumOf(results, line => countOf(line, 'failed')))
  },
  // `===== 1 failed, 1 passed in 0.02s =====`, or `1 failed, 1 passed in 0.02s` under -q
  pytest: lines => verdictOfAll(lines, /^=*\s*(\d+ \w+(, )?)+ in [\d.]+s\b/, line => countOf(line, 'failed') + countOf(line, 'errors?')),
  // `Tests:       1 failed, 1 passed, 2 total`
  jest: lines => verdictOfAll(lines, /^Tests:\s+.*\d+ total$/, line => countOf(line, 'failed')),
  // `      Tests  1 failed | 1 passed (2)`
  vitest: lines => verdictOfAll(lines, /^\s*Tests\s+.*\(\d+\)$/, line => countOf(line, 'failed')),
}

/**
 * The runners whose summary a line filter (`grep`) cannot half-hide: one line
 * holding every count, or a pass line and a fail line both required. go reads
 * a pass off the absence of a `FAIL` line and cargo adds up a line per test
 * binary, so a filter that drops one line turns their fail into a pass.
 */
const FILTERABLE: readonly Family[] = ['bun', 'deno', 'node', 'pytest', 'jest', 'vitest']

/** Whether a run of this runner, piped through a line filter, can still settle on its summary. */
export function isFilterable(family: Family | 'any'): boolean {
  return family === 'any' || FILTERABLE.includes(family)
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
 * @param isFiltered whether a line filter may have dropped lines: then only FILTERABLE runners' summaries count
 */
export function summaryOf(output: string, family: Family | 'any', isFiltered = false): Outcome {
  const lines = output.replace(ANSI, '').split('\n').map(line => line.trimEnd())
  const named = family === 'any' ? (Object.keys(READERS) as Family[]) : [family]
  const families = isFiltered ? named.filter(each => FILTERABLE.includes(each)) : named
  const verdicts = new Set(families.map(each => READERS[each](lines)).filter(verdict => verdict !== null))

  return verdicts.size === 1 ? [...verdicts][0] ?? 'void' : 'void'
}

function verdictOf(passed: number, failed: number): 'pass' | 'fail' | null {
  if (failed > 0) {
    return 'fail'
  }

  return passed > 0 ? 'pass' : null
}
