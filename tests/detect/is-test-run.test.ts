import { describe, expect, test, tier } from 'claude-code/testing'

import Detect from '../../hooks/detect'

tier('user')

const TEST_RUNS = [
  'npm test',
  'npm run test',
  'npm t',
  'pnpm test',
  'yarn test',
  'bun test',
  'pytest',
  'pytest -q tests/test_api.py',
  'python -m pytest',
  'python3 -m pytest -x',
  'uv run pytest',
  'go test ./...',
  'cargo test',
  'jest',
  'npx jest --runInBand',
  'vitest run',
  'npx vitest',
  'make test',
  'cd app && npm test',
  'CI=1 npm test',
  'npm run build && npm test',
]

const NOT_TEST_RUNS = [
  'ls',
  'git status',
  'cat test.txt',
  'echo pytest',
  'npm install',
  'npm run build',
  'node scripts/import-orders.js',
  'node --version',
  'grep -r "go test" .',
  'pytest-watch',
  'rm -rf node_modules/.cache/jest',
  // head keeps the start and drops the summary
  'pytest 2>&1 | head',
  // in the background: the shell answers at once, before any test has run
  'npm test &',
  'npm test & wait',
  'bun test 2>&1 &',
  'cd app && npm test &',
  // grep -v drops the lines it names, and a failing summary is the likeliest to be named
  'npm test 2>&1 | grep -v FAILED',
  'npm test 2>&1 | grep -vE "^# (todo|skipped)"',
  'npm test 2>&1 | grep --invert-match duration',
  // go infers a pass from no FAIL line and cargo adds up a line per binary: a filter can hide a failure
  'go test ./... | grep FAIL',
  'cargo test 2>&1 | grep "test result"',
  // -o keeps part of a line: `1 failed, 3 passed in 0.02s` can come out as `3 passed in 0.02s`
  'pytest 2>&1 | grep -o "[0-9]* passed in [0-9.]*s"',
  'npm test 2>&1 | grep -oE "# (pass|fail) [0-9]+"',
  'npm test 2>&1 | grep --only-matching "pass [0-9]*"',
  // grep reads any unambiguous prefix of a long option: --only is --only-matching
  'pytest 2>&1 | grep --only "[0-9]* passed in [0-9.]*s"',
  // a heredoc's lines are data written to a file, not commands
  "cat > notes.md <<'EOF'\nnpm test\nEOF",
  'cat > notes.md <<\\EOF\nnpm test\nEOF',
  "cat > notes.md <<'END-NOTE'\nnpm test\nEND-NOTE",
  'cat > notes.md <<"END NOTE"\nnpm test\nEND NOTE',
  // only <<- lets the closing word be indented: here the body runs on past the tab
  'cat > notes.md <<EOF\n\tEOF\nnpm test\nEOF',
]

/** A command Claude ran: the fix written through heredocs, then the tests through grep. */
const FIX_THEN_TEST = [
  "python3 - <<'EOF'",
  "s = s.replace(\"$6)',\", \"$6) ON CONFLICT (external_ref) DO NOTHING',\")",
  'EOF',
  "git diff scripts; docker compose exec -T db psql -U app -d orders -v ON_ERROR_STOP=1 <<'EOF'",
  "DELETE FROM orders WHERE import_batch='csv-2026-10-07';",
  'EOF',
  'npm test 2>&1 | grep -E "^(not ok|ok|# (pass|fail))"',
].join('\n')

describe('is-test-run', () => {
  test('a command that runs a test runner opens a market', () => {
    const missed = TEST_RUNS.filter(command => !Detect.isTestRun(command))

    expect(missed).toEqual([])
  })

  test('a command that only names a runner, or does something else, opens none', () => {
    const opened = NOT_TEST_RUNS.filter(command => Detect.isTestRun(command))

    expect(opened).toEqual([])
  })

  test('a run piped only through tail, tee or cat opens a market, marked piped', () => {
    const whole = { settlesOnSummary: true, isFiltered: false }
    expect(Detect.testRunOf('npm test | tail -20')).toEqual({ family: 'any', ...whole })
    expect(Detect.testRunOf('bun test 2>&1 | tail -30')).toEqual({ family: 'bun', ...whole })
    expect(Detect.testRunOf('pytest -q 2>&1 | tee out.log | tail -n 5')).toEqual({ family: 'pytest', ...whole })
    expect(Detect.testRunOf('cargo test 2>&1 | cat')).toEqual({ family: 'cargo', ...whole })
    expect(Detect.testRunOf('node --test 2>&1 | tail -30')).toEqual({ family: 'node', ...whole })
  })

  test('a run piped through grep opens a market, marked filtered', () => {
    const filtered = { settlesOnSummary: true, isFiltered: true }
    expect(Detect.testRunOf('npm test 2>&1 | grep -E "^(not )?ok|^# (pass|fail)"')).toEqual({ family: 'any', ...filtered })
    expect(Detect.testRunOf('npm test | tail -20 | grep passed')).toEqual({ family: 'any', ...filtered })
    expect(Detect.testRunOf('node --test 2>&1 | egrep "^# (pass|fail)"')).toEqual({ family: 'node', ...filtered })
    expect(Detect.testRunOf('pytest -q 2>&1 | grep -E "passed|failed" | tail -3')).toEqual({ family: 'pytest', ...filtered })
  })

  test('the run after heredocs and quoted pipes is found where Claude ran it', () => {
    expect(Detect.testRunOf(FIX_THEN_TEST)).toEqual({ family: 'any', settlesOnSummary: true, isFiltered: true })
    expect(Detect.testRunOf('echo "build | lint" && npm test')).toEqual({ family: 'any', settlesOnSummary: false, isFiltered: false })
    // the body ends at its own word, and the run after it counts
    expect(Detect.testRunOf('cat > notes.md <<\\EOF\nnotes\nEOF\nnpm test')).toEqual({ family: 'any', settlesOnSummary: false, isFiltered: false })
    expect(Detect.testRunOf("cat > notes.md <<-'END-NOTE'\n\tnotes\n\tEND-NOTE\nnpm test")).toEqual({ family: 'any', settlesOnSummary: false, isFiltered: false })
    // an apostrophe in a comment opens no quote
    expect(Detect.testRunOf("# run the suite, it's quick\nnpm test 2>&1 | grep -E 'Tests:'")).toEqual({ family: 'any', settlesOnSummary: true, isFiltered: true })
    // in $'...' a backslash escapes the quote, so the pipe after it is a pipe
    expect(Detect.testRunOf("npm test -- -t $'it\\'s' | grep -E '^# (pass|fail)'")).toEqual({ family: 'any', settlesOnSummary: true, isFiltered: true })
  })

  test('a run that is the last command settles on its exit code', () => {
    const exitCode = { settlesOnSummary: false, isFiltered: false }
    expect(Detect.testRunOf('bun test')).toEqual({ family: 'bun', ...exitCode })
    expect(Detect.testRunOf('cd app && npm test')).toEqual({ family: 'any', ...exitCode })
    // redirections are not background runs
    expect(Detect.testRunOf('npm test 2>&1')).toEqual({ family: 'any', ...exitCode })
    expect(Detect.testRunOf('npm test &> test.log')).toEqual({ family: 'any', ...exitCode })
    expect(Detect.testRunOf('npm test >&2')).toEqual({ family: 'any', ...exitCode })
    // nothing runs after a trailing newline or a comment
    expect(Detect.testRunOf('npm test\n')).toEqual({ family: 'any', ...exitCode })
    expect(Detect.testRunOf('npm test\n# that was all')).toEqual({ family: 'any', ...exitCode })
  })

  test('a run with a command after it settles on its summary: the exit code is the last command\'s', () => {
    const summary = { settlesOnSummary: true, isFiltered: false }
    expect(Detect.testRunOf('npm test || echo failed')).toEqual({ family: 'any', ...summary })
    expect(Detect.testRunOf('npm test; git status')).toEqual({ family: 'any', ...summary })
    expect(Detect.testRunOf('npm test && git push')).toEqual({ family: 'any', ...summary })
    expect(Detect.testRunOf('npm test\ngit status --short')).toEqual({ family: 'any', ...summary })
  })

  test('each runner names the summary it prints; a script runner names none', () => {
    const families = {
      'bun test': 'bun',
      'deno test': 'deno',
      'node --test': 'node',
      'node --test test/': 'node',
      'go test ./...': 'go',
      'cargo test': 'cargo',
      'uv run pytest': 'pytest',
      'python3 -m pytest -x': 'pytest',
      'npx jest --runInBand': 'jest',
      'vitest run': 'vitest',
      'npm test': 'any',
      'make test': 'any',
    }

    for (const [command, family] of Object.entries(families)) {
      expect(Detect.testRunOf(command)?.family, command).toBe(family)
    }
  })
})
