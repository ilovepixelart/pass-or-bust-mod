/** What ends a step: after one, the next command runs whatever this one did. */
const SEPARATORS = ['&&', '||', ';'] as const

/** A heredoc's opening: `<<EOF`, `<<-EOF`, `<<\\EOF`, `<< 'END-NOTE'`, `<<"END NOTE"`. */
const HEREDOC = /^<<(-?)\s*(?:\\([^\s;&|<>()]+)|'([^'\n]*)'|"([^"\n]*)"|([^\s;&|<>()'"]+))/

/** What may come right before a `#` that starts a comment: a comment starts a word. */
const WORD_BREAK = /[\s;&|()]/

/** The line that ends a heredoc's body; after `<<-` it may be indented with tabs. */
type Delimiter = { word: string; isDashed: boolean }

type Token = { kind: 'text' | 'pipe' | 'step' | 'background' | 'line'; end: number; delimiter?: Delimiter }

/** One step of a command: the stages of its pipeline, and whether a lone `&` sent it to the background. */
export type Step = { stages: string[]; isBackground: boolean }

/**
 * A shell command cut into its steps, at `&&`, `||`, `;`, a lone `&` and
 * newlines, and each step into the stages of its pipeline, at `|`. A `&` in a
 * redirection (`2>&1`, `&>log`, `>&2`) cuts nothing.
 *
 * Quoted text is never cut: in `grep -E "ok|fail"` the `|` is the pattern's. A
 * heredoc's lines are data, not commands, so they belong to no step, and a
 * comment runs to the end of its line, apostrophes and all.
 *
 * @param command the Bash command as Claude wrote it
 * @returns each step, in order
 */
export function stepsOf(command: string): Step[] {
  const steps: Step[] = []
  let stages: string[] = []
  let stage = ''
  let delimiters: Delimiter[] = []
  let at = 0

  while (at < command.length) {
    const token = tokenAt(command, at)
    if (token.kind === 'text') {
      stage += command.slice(at, token.end)
    } else {
      stages.push(stage)
      stage = ''
    }
    if (token.kind !== 'text' && token.kind !== 'pipe') {
      steps.push({ stages, isBackground: token.kind === 'background' })
      stages = []
    }
    if (token.delimiter !== undefined) {
      delimiters.push(token.delimiter)
    }
    at = token.kind === 'line' ? pastBodies(command, token.end, delimiters) : token.end
    delimiters = token.kind === 'line' ? [] : delimiters
  }

  stages.push(stage)
  steps.push({ stages, isBackground: false })

  return steps
}

function tokenAt(command: string, at: number): Token {
  const char = command[at]
  if (char === "'" || char === '"') {
    return { kind: 'text', end: closingQuoteOf(command, at) + 1 }
  }
  if (char === '#' && (at === 0 || WORD_BREAK.test(command[at - 1] ?? ''))) {
    const newline = command.indexOf('\n', at)

    return { kind: 'text', end: newline === -1 ? command.length : newline }
  }
  if (char === '\\') {
    return { kind: 'text', end: at + 2 }
  }
  if (command.startsWith('<<', at)) {
    return heredocAt(command, at)
  }
  if (char === '\n') {
    return { kind: 'line', end: at + 1 }
  }
  const separator = SEPARATORS.find(each => command.startsWith(each, at))
  if (separator !== undefined) {
    return { kind: 'step', end: at + separator.length }
  }
  if (char === '&' && !/[<>|]/.test(command[at - 1] ?? '') && command[at + 1] !== '>') {
    return { kind: 'background', end: at + 1 }
  }

  return { kind: char === '|' ? 'pipe' : 'text', end: at + 1 }
}

/** Where a quote opened at `at` closes; an unclosed one runs to the end. */
function closingQuoteOf(command: string, at: number): number {
  const quote = command[at]
  // a backslash escapes in "..." and in $'...', never in plain '...'
  const escapes = quote === '"' || command[at - 1] === '$'
  for (let index = at + 1; index < command.length; index += 1) {
    if (escapes && command[index] === '\\') {
      index += 1
    } else if (command[index] === quote) {
      return index
    }
  }

  return command.length - 1
}

/** A heredoc's opening as text, with the word that ends its body; a here-string (`<<<`) has none. */
function heredocAt(command: string, at: number): Token {
  if (command.startsWith('<<<', at)) {
    return { kind: 'text', end: at + 3 }
  }
  const opening = HEREDOC.exec(command.slice(at))
  if (opening === null) {
    return { kind: 'text', end: at + 2 }
  }

  const word = opening[2] ?? opening[3] ?? opening[4] ?? opening[5] ?? ''

  return { kind: 'text', end: at + opening[0].length, delimiter: { word, isDashed: opening[1] === '-' } }
}

/** Past the bodies of the heredocs opened on the line before `from`, each ended by its word on a line of its own. */
function pastBodies(command: string, from: number, delimiters: readonly Delimiter[]): number {
  let at = from
  for (const { word, isDashed } of delimiters) {
    while (at < command.length) {
      const newline = command.indexOf('\n', at)
      const end = newline === -1 ? command.length : newline
      const line = command.slice(at, end)
      at = end + 1
      if ((isDashed ? line.replace(/^\t+/, '') : line) === word) {
        break
      }
    }
  }

  return Math.min(at, command.length)
}
