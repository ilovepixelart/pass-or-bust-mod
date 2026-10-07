import Art from '../../hooks/art'

/** A drawn element as the kit describes it: its tag, its props, its children. */
type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

/** What a mounted drawing can be read with: the tree, and each `Client`'s own. */
type Readable = {
  findAll: (query: { type?: string; in?: string }) => Promise<{ type: string; key: string | undefined; props: Record<string, unknown>; children: unknown[] }[]>
}

/** One drawn element and every element under it, as the kit counts nodes. */
export type Laid = { lines: string[]; nodes: number; colored: { text: string; color: unknown }[] }

const childrenOf = (node: Drawn): unknown[] => node.children ?? (node.props?.children as unknown[] | undefined) ?? []

/**
 * The terminal lines a drawing lays out to, read off its tree: a Text is one
 * line of its text, a row Box sets its children side by side, a column Box
 * stacks them, padding and a border frame them, a Button draws as the
 * terminal does, and a `Client` is what its module drew. No wrapping: every
 * test asserts the lines fit the columns, so nothing would wrap.
 */
export async function layOut(ui: Readable): Promise<Laid> {
  const [root] = await ui.findAll({ type: 'Box' })
  const clients = new Map<string, Drawn>()
  for (const client of await ui.findAll({ type: 'Client' })) {
    const [drawn] = client.key === undefined ? [] : await ui.findAll({ in: client.key })
    if (client.key !== undefined && drawn !== undefined) {
      clients.set(client.key, drawn)
    }
  }

  return root === undefined ? { lines: [], nodes: 0, colored: [] } : laid(root, clients)
}

function laid(node: Drawn, clients: Map<string, Drawn>): Laid {
  const props = node.props ?? {}
  if (node.type === 'Text') {
    const colored: Laid['colored'] = []
    const text = textOf(node, colored)

    return { lines: [text], nodes: 1 + nestedTexts(node), colored }
  }
  if (node.type === 'Button') {
    const label = String(props.label ?? '')
    const line = props.plain === true ? (props.hotkey === undefined ? label : `${String(props.hotkey)}: ${label}`) : `[ ${label} ]`

    return { lines: [line], nodes: 1, colored: [] }
  }
  if (node.type === 'Client') {
    const drawn = clients.get(String(props.key ?? ''))
    const inner = drawn === undefined ? { lines: [], nodes: 0, colored: [] } : laid(drawn, clients)

    return { ...inner, nodes: inner.nodes + 1 }
  }

  const parts = childrenOf(node)
    .filter((child): child is Drawn => typeof child === 'object' && child !== null)
    .map(child => laid(child, clients))
  const isColumn = props.flexDirection === 'column'
  let lines: string[]
  if (isColumn) {
    lines = parts.flatMap(part => part.lines)
  } else {
    const rows = Math.max(0, ...parts.map(part => part.lines.length))
    lines = Array.from({ length: rows }, (_, row) =>
      parts
        .map(part => {
          const width = Math.max(0, ...part.lines.map(line => Art.widthOf(line)))
          const line = part.lines[row] ?? ''

          return line + ' '.repeat(width - Art.widthOf(line))
        })
        .join(''),
    )
  }

  const padX = Number(props.paddingX ?? props.padding ?? 0)
  const bordered = props.borderStyle !== undefined
  const width = Math.max(0, ...lines.map(line => Art.widthOf(line)))
  const padded = lines.map(line => `${' '.repeat(padX)}${line}${' '.repeat(width - Art.widthOf(line) + padX)}`)
  const framed = bordered
    ? [`╭${'─'.repeat(width + padX * 2)}╮`, ...padded.map(line => `│${line}│`), `╰${'─'.repeat(width + padX * 2)}╯`]
    : padded

  return {
    lines: framed,
    nodes: 1 + parts.reduce((sum, part) => sum + part.nodes, 0),
    colored: parts.flatMap(part => part.colored),
  }
}

function textOf(node: Drawn, colored: Laid['colored']): string {
  const text = childrenOf(node)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : typeof child === 'object' && child !== null ? textOf(child as Drawn, colored) : ''))
    .join('')
  colored.push({ text, color: node.props?.color })

  return text
}

function nestedTexts(node: Drawn): number {
  return childrenOf(node)
    .filter((child): child is Drawn => typeof child === 'object' && child !== null)
    .reduce((sum, child) => sum + 1 + nestedTexts(child), 0)
}
