import type { On, RenderPropsOf, ToolCallResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

import Art from '../../hooks/art'
import Fixtures from '../fixtures'
import type { Laid } from '../fixtures'

tier('user')

/** A command long enough that every view has to fit it. */
const LONG = 'cd packages/checkout && CI=1 bun test --coverage --timeout 20000 src/cart/totals.test.ts src/cart/tax.test.ts'

/** Moments after a mount: partial reel offsets, the stop, the tally, the stamp. */
const RUNNING_MS = [0, 17, 35, 333, 1_000, 4_330]
const SETTLED_MS = [0, 40, 400, 1_000, 1_700, 2_300, 2_700, 3_200, 3_600, 4_200, 5_000, 6_000, 6_900]

/** What may be drawn: ASCII, box drawing, block elements, and these. */
const ALLOWED_EXTRA = new Set(['✓', '✕', '·', '▴', '▾', '●', '•'])
const isAllowed = (char: string) => {
  const code = char.codePointAt(0) ?? 0

  return (code >= 0x20 && code <= 0x7e) || (code >= 0x2500 && code <= 0x259f) || ALLOWED_EXTRA.has(char)
}

/** Text that is body copy, never colored: the terminal's own color draws it. */
const BODY = ['npm test', 'bun test', 'cd packages', 'Will they pass?', 'won ·', ' bankroll ', 'time ', 'Bets', 'Pass rate', 'No open bet', 'stake ', 'pays ']

type Shot = { label: string; laid: Laid; columns: number; rows?: number }

async function mounted($: Engine, label: string, ms: number, props: RenderPropsOf['AbovePrompt']): Promise<Shot> {
  const ui = await $.ui.mount({ plugin: Fixtures.PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
  await ui.advance(ms)
  const laid = await Fixtures.layOut(ui)
  await ui.unmount()

  return { label: `${label} at ${ms}ms`, laid, columns: props.bodyColumns, rows: props.maxRows }
}

async function paneShot($: Engine, label: string, columns: number): Promise<Shot> {
  await $.command.run(Fixtures.BANKROLL)
  const ui = await $.ui.mount({
    plugin: Fixtures.PLUGIN,
    surface: 'terminal',
    component: 'Pane',
    requestId: 'bankroll',
    props: { ...Fixtures.PANE_PROPS, bodyColumns: columns },
  })
  await ui.advance(2_000)
  const laid = await Fixtures.layOut(ui)
  await ui.unmount()

  return { label, laid, columns }
}

/** Every state the band and the pane can be in, at one width and height. */
async function everyState($: Engine, on: On, columns: number, maxRows: number): Promise<Shot[]> {
  Fixtures.inSession(on)
  // a bankroll on a two-win streak, so the streak's marks are drawn too
  mock.store(on, { 'history:/work': { passes: 3, fails: 1 }, bank: Fixtures.SESSION_BANK })
  clocks.set($, mock.clock(on))
  on('ui.toast', () => ({ value: undefined }))
  on('audio.play', () => ({ value: undefined }))
  heldTools.set($, Fixtures.heldTool(on))
  await $.session.start(Fixtures.SESSION)

  return everyStateAgain($, columns, maxRows)
}

const heldTools = new Map<Engine, ReturnType<typeof Fixtures.heldTool>>()
const clocks = new Map<Engine, ReturnType<typeof mock.clock>>()

/** The same states again in a session everyState started, at another size. */
async function everyStateAgain($: Engine, columns: number, maxRows: number): Promise<Shot[]> {
  const tool = heldTools.get($)
  if (tool === undefined) {
    throw new Error('everyState starts the session first')
  }
  const props = { ...Fixtures.SLOTS_BAND_PROPS, bodyColumns: columns, maxRows }
  const shots: Shot[] = []
  const runs: { bet: 'bet-pass' | 'bet-fail' | null; ran: ToolCallResult; name: string }[] = [
    { bet: 'bet-fail', ran: Fixtures.FAILED, name: 'won' },
    { bet: 'bet-fail', ran: Fixtures.PASSED, name: 'lost' },
    { bet: 'bet-pass', ran: Fixtures.INTERRUPTED, name: 'void' },
    { bet: null, ran: Fixtures.PASSED, name: 'no bet' },
  ]

  for (const run of runs) {
    const call = $.tool.call({ tool: 'Bash', command: LONG })
    await tool.reached
    for (const ms of RUNNING_MS) {
      shots.push(await mounted($, `${columns}x${maxRows} ${run.name}: spinning`, ms, props))
    }
    if (run.bet !== null) {
      const ui = await $.ui.mount({ plugin: Fixtures.PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
      await ui.press({ key: run.bet })
      await ui.unmount()
      shots.push(await mounted($, `${columns}x${maxRows} ${run.name}: bet placed`, 333, props))
    }
    tool.release(run.ran)
    // the result is held while the reels stop
    await clocks.get($)?.advance(2_500)
    await call
    for (const ms of SETTLED_MS) {
      shots.push(await mounted($, `${columns}x${maxRows} ${run.name}: settled`, ms, props))
    }
    shots.push(await paneShot($, `${columns} /bankroll after ${run.name}`, columns))
  }

  return shots
}

describe('rendered', () => {
  for (const columns of [80, 100, 120]) {
    for (const maxRows of [30, 12, 6]) {
      test(`${columns} columns, ${maxRows} rows: every line fits across, the band fits down, only safe glyphs`, async ($, on) => {
        const shots = await everyState($, on, columns, maxRows)
        const wide = shots.flatMap(shot =>
          shot.laid.lines.filter(line => Art.widthOf(line) > shot.columns).map(line => `${shot.label}: ${Art.widthOf(line)} > ${shot.columns}: ${line}`),
        )
        const tall = shots.filter(shot => shot.rows !== undefined && shot.laid.lines.length > shot.rows).map(shot => `${shot.label}: ${shot.laid.lines.length} rows`)
        const glyphs = new Set(shots.flatMap(shot => shot.laid.lines.flatMap(line => [...line].filter(char => !isAllowed(char)))))

        expect(shots.length).toBeGreaterThan(60)
        expect(wide).toEqual([])
        expect(tall).toEqual([])
        expect([...glyphs]).toEqual([])
      })
    }
  }

  test('every outcome is told by a glyph and a word, never by color alone', async ($, on) => {
    const shots = await everyState($, on, 100, 30)
    const textOf = (name: string) => shots.filter(shot => shot.label.includes(`${name}: settled`)).map(shot => shot.laid.lines.join('\n')).join('\n')

    expect(textOf('won')).toContain('✕ TESTS FAILED. You called it.')
    expect(textOf('won')).toContain('✓ CASHED OUT.')
    expect(textOf('lost')).toContain('✓ TESTS PASSED. The house thanks you.')
    expect(textOf('lost')).toContain('✕ BUSTED')
    expect(textOf('void')).toContain('· NO RESULT. Stake refunded.')
    expect(textOf('void')).toContain('· REFUNDED.')
    expect(textOf('no bet')).toContain('✓ TESTS PASSED. No money on it.')
    // one glyph per outcome line, as every other screen writes it
    for (const name of ['won', 'lost', 'void', 'no bet']) {
      expect(textOf(name), name).not.toMatch(/[✓✕·] [✓✕·] [✓✕·]/)
    }
  })

  test('body text carries no color: the terminal draws it in its own', async ($, on) => {
    // 30 rows draws the slot machine, 12 the compact market: both, in one session
    const shots = [...(await everyState($, on, 100, 30)), ...(await everyStateAgain($, 100, 12))]
    const colored = shots.flatMap(shot =>
      shot.laid.colored
        .filter(text => text.color !== undefined && BODY.some(body => text.text.includes(body)))
        .map(text => `${shot.label}: ${JSON.stringify(text.text)} in ${String(text.color)}`),
    )

    expect(colored).toEqual([])
  })

  test('between runs the market keeps its four rows at every width: no row wraps, even with a streak to show', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on, { 'history:/work': { passes: 3, fails: 1 }, bank: Fixtures.SESSION_BANK })
    const tool = Fixtures.heldTool(on)
    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    tool.release(Fixtures.FAILED)
    await call

    for (const columns of [60, 64, 68, 72, 74, 76, 78, 80, 100, 120]) {
      const shot = await mounted($, `market ${columns}`, 8_000, { ...Fixtures.BAND_PROPS, bodyColumns: columns, maxRows: 12 })
      // four rows in a frame: the border above and below, and none wider than the band
      expect(shot.laid.lines.length, `${columns}: ${shot.laid.lines.join('\n')}`).toBe(6)
      expect(shot.laid.lines.filter(line => Art.widthOf(line) > columns), `${columns} across`).toEqual([])
    }
  })

  test('/bankroll in a narrow dock draws every row once: no ledger row, chart row or bet wraps', async ($, on) => {
    Fixtures.inSession(on)
    // fifteen bets, the most the chart draws, with a long command each
    const deltas = [90, -100, 142, -100, 185, -100, -100, 90, 90, -100, 142, 185, -100, 90, 90]
    const recent = deltas.map((delta, index) => ({
      side: index % 2 === 0 ? ('pass' as const) : ('fail' as const),
      stake: 100,
      multiplier: delta > 0 ? (delta + 100) / 100 : 1.9,
      outcome: delta > 0 ? ('pass' as const) : ('fail' as const),
      delta,
      command: 'cd packages/checkout && CI=1 bun test --coverage',
    }))
    mock.store(on, { 'history:/work': { passes: 3, fails: 1 }, bank: { ...Fixtures.SESSION_BANK, voids: 1, recent } })
    await $.session.start(Fixtures.SESSION)

    const wide = await paneShot($, 'wide', 100)
    for (const columns of [64, 48, 40]) {
      const narrow = await paneShot($, `${columns}`, columns)
      expect(narrow.laid.lines.filter(line => Art.widthOf(line) > columns), `${columns} across`).toEqual([])
      expect(narrow.laid.lines.length, `${columns} columns draws as many rows as 100`).toBe(wide.laid.lines.length)
      expect(narrow.laid.lines.filter(line => /:\s*$/.test(line)), `${columns}: no row ends on a colon with nothing after it`).toEqual([])
    }
  })

  test('/bankroll before any bet fits a narrow dock too', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    await $.session.start(Fixtures.SESSION)

    const empty = await paneShot($, 'empty', 40)
    expect(empty.laid.lines.filter(line => Art.widthOf(line) > 40)).toEqual([])
    expect(empty.laid.lines.join('\n')).toContain('No bets yet.')
  })

  test('/bankroll stays far under the engine node limit with 200 recorded bets', async ($, on) => {
    Fixtures.inSession(on)
    const recent = Array.from({ length: 200 }, (_, index) => ({
      side: 'pass' as const,
      stake: 100,
      multiplier: 1.9,
      outcome: index % 3 === 0 ? ('fail' as const) : ('pass' as const),
      delta: index % 3 === 0 ? -100 : 90,
      command: `npm test -- run ${index}`,
      balance: 1_000 + index,
    }))
    mock.store(on, { bank: { ...Fixtures.SESSION_BANK, recent } })
    await $.session.start(Fixtures.SESSION)
    const shot = await paneShot($, '200 bets', 100)

    // the engine refuses a tree past 20,000 nodes; well under is a tenth of that
    expect(shot.laid.nodes).toBeLessThan(2_000)
    expect(shot.laid.nodes).toBeGreaterThan(20)
  })

  test('/bankroll draws as many nodes for 200 recorded bets as for 15: the chart does not grow with the history', async ($, on) => {
    Fixtures.inSession(on)
    const betsOf = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        side: 'pass' as const,
        stake: 100,
        multiplier: 1.9,
        outcome: index % 3 === 0 ? ('fail' as const) : ('pass' as const),
        delta: index % 3 === 0 ? -100 : 90,
        command: 'npm test',
        balance: 1_000 + (index % 7) * 50,
      }))
    const stored: Record<string, unknown> = { bank: { ...Fixtures.SESSION_BANK, recent: betsOf(15) } }
    on('store.get', ($, e) => ({ value: stored[e.key] }))
    on('store.set', ($, e) => {
      stored[e.key] = e.value

      return { value: undefined }
    })
    await $.session.start(Fixtures.SESSION)
    const fifteen = await paneShot($, '15 bets', 100)
    stored.bank = { ...Fixtures.SESSION_BANK, recent: betsOf(200) }
    await $.session.start(Fixtures.SESSION)
    const twoHundred = await paneShot($, '200 bets', 100)

    expect(twoHundred.laid.nodes).toBe(fifteen.laid.nodes)
  })
})
