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
  // head keeps the start and drops the summary; grep keeps what it likes
  'pytest 2>&1 | head',
  'go test ./... | grep FAIL',
  'npm test | tail -20 | grep passed',
]

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
    expect(Detect.testRunOf('npm test | tail -20')).toEqual({ family: 'any', isPiped: true })
    expect(Detect.testRunOf('bun test 2>&1 | tail -30')).toEqual({ family: 'bun', isPiped: true })
    expect(Detect.testRunOf('pytest -q 2>&1 | tee out.log | tail -n 5')).toEqual({ family: 'pytest', isPiped: true })
    expect(Detect.testRunOf('cargo test 2>&1 | cat')).toEqual({ family: 'cargo', isPiped: true })
    expect(Detect.testRunOf('node --test 2>&1 | tail -30')).toEqual({ family: 'node', isPiped: true })
  })

  test('an unpiped run is marked unpiped, its exit code settles it', () => {
    expect(Detect.testRunOf('bun test')).toEqual({ family: 'bun', isPiped: false })
    expect(Detect.testRunOf('cd app && npm test')).toEqual({ family: 'any', isPiped: false })
    expect(Detect.testRunOf('npm test || echo failed')).toEqual({ family: 'any', isPiped: false })
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
