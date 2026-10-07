import type { On, ToolCallResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

import Slots from '../../hooks/slots'
import Fixtures from '../fixtures'

tier('user')

/** The band as laid out `ms` after it mounts: the machine's clock starts at the mount. */
async function bandAt($: Engine, ms: number, props = Fixtures.SLOTS_BAND_PROPS) {
  const ui = await $.ui.mount({ plugin: Fixtures.PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
  await ui.advance(ms)
  const laid = await Fixtures.layOut(ui)
  await ui.unmount()

  return laid.lines
}

/** The payline: the one line with both markers. */
const paylineOf = (lines: string[]) => lines.find(line => line.includes('>') && line.includes('<')) ?? ''

const countOf = (text: string, part: string) => text.split(part).length - 1

/** The machine first sees the result on its first tick, so its reels have all stopped by then. */
const STOPPED = Slots.stoppedAt(40) + 40

describe('machine', () => {
  async function settled($: Engine, on: On, ran: ToolCallResult, bet: 'bet-pass' | 'bet-fail' | null) {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    on('ui.toast', () => ({ value: undefined }))
    on('audio.play', () => ({ value: undefined }))
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    if (bet !== null) {
      const ui = await $.ui.mount({ plugin: Fixtures.PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: Fixtures.SLOTS_BAND_PROPS })
      await ui.press({ key: bet })
      await ui.unmount()
    }
    tool.release(ran)
    // the result is held while the reels stop
    await clock.advance(2_500)
    await call
  }

  test('while the tests run, the reels spin beside the run, with the bet buttons under them', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const early = await bandAt($, 400)
    const later = await bandAt($, 1_000)
    tool.release(Fixtures.PASSED)
    await call

    const text = early.join('\n')
    expect(countOf(text, '┌─────────┐')).toBe(3)
    expect(text).toContain('$ TESTS RUNNING')
    expect(text).toContain('npm test')
    expect(text).toContain('time 0:00')
    expect(text).toContain('No bet yet.')
    expect(text).toContain('The reels are rigged. By your test suite.')
    expect(text).toContain('1: ✓ Bet pass $100   2: ✕ Bet fail $100   [ Hide ]')
    expect(countOf(text, 'Bet pass'), 'how to bet is said once: by the buttons under the reels').toBe(1)
    expect(text).not.toContain('type 1')
    expect(paylineOf(later), 'the reels move on').not.toBe(paylineOf(early))
  })

  for (const { name, ran, art, words } of [
    { name: 'pass', ran: Fixtures.PASSED, art: ['█▄  ▄█▀', '█▄  ▄█▀', '█▄  ▄█▀'], words: '✓ TESTS PASSED.' },
    { name: 'fail', ran: Fixtures.FAILED, art: [' ▀█▄█▀ ', ' ▀█▄█▀ ', ' ▀█▄█▀ '], words: '✕ TESTS FAILED.' },
    { name: 'void', ran: Fixtures.INTERRUPTED, art: ['█ BAR █', '▀▀█▀█▄ ', '   ▄█▀ '], words: '· NO RESULT.' },
  ]) {
    test(`a run that settles ${name} stops the reels on ${name}, left to right, and says so in words`, async ($, on) => {
      await settled($, on, ran, null)
      const lines = await bandAt($, STOPPED)
      const payline = paylineOf(lines)

      // the three tiles' middle rows, left to right, on the payline
      let from = 0
      for (const tile of art) {
        const at = payline.indexOf(tile, from)
        expect(at, `${tile} after column ${from}`).toBeGreaterThan(-1)
        from = at + tile.length
      }
      expect(lines.join('\n')).toContain(words)
    })
  }

  test('a winning bet: reels, then the tally rolls the payout in, then the stamp', async ($, on) => {
    await settled($, on, Fixtures.FAILED, 'bet-fail')

    const reels = (await bandAt($, STOPPED)).join('\n')
    const tally = (await bandAt($, STOPPED + 2_200)).join('\n')
    const stamp = (await bandAt($, 6_400)).join('\n')

    expect(reels).toContain('✕ TESTS FAILED. You called it.')
    expect(reels).toContain('YOUR BET')
    expect(reels).toContain('$100 on ✕ FAIL')
    expect(tally).toContain('✓ CASHED OUT. Count it.')
    expect(tally).toContain('stake $100  x  x1.90  =  $190')
    expect(tally).toContain('●')
    expect(stamp).toContain('✓ CASHED OUT. +$90.   paid $190   bankroll $1,090')
  })

  test('a losing bet ends BUSTED, with no coins', async ($, on) => {
    await settled($, on, Fixtures.PASSED, 'bet-fail')

    const reels = (await bandAt($, STOPPED)).join('\n')
    const stamp = (await bandAt($, 6_400)).join('\n')

    expect(reels).toContain('✓ TESTS PASSED. The house thanks you.')
    expect(stamp).toContain('✕ BUSTED. -$100.')
    expect(stamp).not.toContain('●')
  })

  test('a lost bet tallies where the stake went, never false arithmetic', async ($, on) => {
    await settled($, on, Fixtures.PASSED, 'bet-fail')

    const tally = (await bandAt($, STOPPED + 2_000)).join('\n')

    expect(tally).toContain('stake $100  ->  the house')
    expect(tally).not.toContain('=  $0')
  })

  test('a void bet tallies the stake coming back', async ($, on) => {
    await settled($, on, Fixtures.INTERRUPTED, 'bet-fail')

    const tally = (await bandAt($, STOPPED + 2_000)).join('\n')

    expect(tally).toContain('stake $100  ->  back to you')
  })

  test('broke, the side panel offers no bet it cannot take: it points at the bailout', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on, { bank: { balance: 40, pnl: -960, wins: 0, losses: 10, voids: 0, bailouts: 0, recent: [] } })
    mock.clock(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const spinning = (await bandAt($, 400)).join('\n')
    tool.release(Fixtures.PASSED)
    await call

    expect(spinning).toContain('TESTS RUNNING')
    expect(spinning).not.toContain('type 1 pass, 2 fail')
    expect(spinning).toContain('Broke. Bailout below.')
    expect(countOf(spinning, 'Broke.'), 'broke is said once').toBe(1)
    expect(spinning).toContain('b: Bailout')
  })

  test('the machine declares its height: a bare digit arms the buttons under it only when the engine can place them', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const ui = await $.ui.mount({ plugin: Fixtures.PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: Fixtures.SLOTS_BAND_PROPS })
    const [machine] = await ui.findAll({ type: 'Client' })
    const drawn = (await Fixtures.layOut(ui)).lines
    await ui.unmount()
    tool.release(Fixtures.PASSED)
    await call

    // the frame's top row, then the machine, then the buttons and the frame's bottom row
    expect(machine?.props.height).toBe(drawn.length - 3)
  })

  test('a band too short for the reels falls back to the compact market', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const short = (await bandAt($, 400, { ...Fixtures.SLOTS_BAND_PROPS, maxRows: 12 })).join('\n')
    tool.release(Fixtures.PASSED)
    await call

    expect(short).not.toContain('┌─────────┐')
    expect(short).toContain('$ TESTS RUNNING   npm test')
    expect(short).toContain('✓ PASS x1.90')
  })

  test('a band too narrow for the side panel falls back to the compact market', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const narrow = (await bandAt($, 400, { ...Fixtures.SLOTS_BAND_PROPS, bodyColumns: 60 })).join('\n')
    tool.release(Fixtures.PASSED)
    await call

    expect(narrow).not.toContain('┌─────────┐')
    expect(narrow).toContain('✓ PASS x1.90')
  })
})
