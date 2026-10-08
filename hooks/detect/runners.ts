import type { Family } from '../summary'

/**
 * The commands that run a project's tests, each as the words it starts with,
 * and whose summary its output ends with: `any` for a script runner
 * (`npm test`, `make test`) that could be running any of them.
 * A command opens a market when one of its steps starts with one of these.
 */
export const RUNNERS: readonly { words: readonly string[]; family: Family | 'any' }[] = [
  { words: ['npm', 'test'], family: 'any' },
  { words: ['npm', 't'], family: 'any' },
  { words: ['npm', 'run', 'test'], family: 'any' },
  { words: ['pnpm', 'test'], family: 'any' },
  { words: ['pnpm', 'run', 'test'], family: 'any' },
  { words: ['yarn', 'test'], family: 'any' },
  { words: ['yarn', 'run', 'test'], family: 'any' },
  { words: ['bun', 'test'], family: 'bun' },
  { words: ['bun', 'run', 'test'], family: 'any' },
  { words: ['deno', 'test'], family: 'deno' },
  { words: ['node', '--test'], family: 'node' },
  { words: ['jest'], family: 'jest' },
  { words: ['npx', 'jest'], family: 'jest' },
  { words: ['pnpm', 'jest'], family: 'jest' },
  { words: ['vitest'], family: 'vitest' },
  { words: ['npx', 'vitest'], family: 'vitest' },
  { words: ['pnpm', 'vitest'], family: 'vitest' },
  { words: ['pytest'], family: 'pytest' },
  { words: ['python', '-m', 'pytest'], family: 'pytest' },
  { words: ['python3', '-m', 'pytest'], family: 'pytest' },
  { words: ['uv', 'run', 'pytest'], family: 'pytest' },
  { words: ['go', 'test'], family: 'go' },
  { words: ['cargo', 'test'], family: 'cargo' },
  { words: ['make', 'test'], family: 'any' },
  { words: ['mix', 'test'], family: 'any' },
  { words: ['rspec'], family: 'any' },
  { words: ['bundle', 'exec', 'rspec'], family: 'any' },
  { words: ['dotnet', 'test'], family: 'any' },
  { words: ['mvn', 'test'], family: 'any' },
  { words: ['gradle', 'test'], family: 'any' },
  { words: ['./gradlew', 'test'], family: 'any' },
]

/**
 * What a run may be piped through and still settle from its output: each keeps
 * the end of the output, where every runner prints its summary.
 */
export const PIPE_READERS: readonly string[] = ['tail', 'tee', 'cat']
