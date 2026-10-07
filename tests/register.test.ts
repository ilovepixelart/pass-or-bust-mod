import type { On, ToolCallResult } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import Art from '../hooks/art'
import Fixtures from './fixtures'
import { RUNNER_OUTPUT } from './fixtures/runner-output'

tier('user')

describe('register', () => {
  function toastsOf(on: On): string[] {
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)

      return { value: undefined }
    })

    return toasts
  }

  function soundsOf(on: On): string[] {
    const sounds: string[] = []
    on('audio.play', ($, e) => {
      sounds.push(e.clip.asset ?? 'not an asset')

      return { value: undefined }
    })

    return sounds
  }

  function answering(on: On, ran: ToolCallResult) {
    on('tool.call', () => ran)
  }

  async function bandText($: Engine, surface: (typeof Fixtures.SURFACES)[number] = 'terminal') {
    const ui = await $.ui.mount({
      plugin: Fixtures.PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: Fixtures.BAND_PROPS,
    })
    await ui.advance(5_000)
    const { lines } = await Fixtures.layOut(ui)
    await ui.unmount()

    return lines.join('\n')
  }

  async function bandLook($: Engine) {
    const ui = await $.ui.mount({
      plugin: Fixtures.PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      props: Fixtures.BAND_PROPS,
    })
    const [outer] = await ui.findAll({ type: 'Box' })
    const texts = await ui.findAll({ type: 'Text' })
    await ui.unmount()

    return {
      rows: (outer?.children ?? []).filter(child => child !== null && child !== false && child !== '').length,
      colorOf: (fragment: string) => texts.find(found => found.text.includes(fragment))?.props.color,
    }
  }

  /** Waits until the band shows the run in flight: a person sees the market before they can bet on it. */
  async function untilRunning($: Engine) {
    for (let tries = 0; tries < 50; tries += 1) {
      if ((await bandText($)).includes('TESTS RUNNING')) {
        return
      }
    }

    throw new Error('the market never opened')
  }

  async function paneText($: Engine) {
    await $.command.run(Fixtures.BANKROLL)
    const ui = await $.ui.mount({
      plugin: Fixtures.PLUGIN,
      surface: 'terminal',
      component: 'Pane',
      requestId: 'bankroll',
      props: Fixtures.PANE_PROPS,
    })
    await ui.advance(5_000)
    const { lines } = await Fixtures.layOut(ui)
    await ui.unmount()

    return lines.join('\n')
  }

  async function press($: Engine, key: string) {
    const ui = await $.ui.mount({
      plugin: Fixtures.PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      props: Fixtures.BAND_PROPS,
    })
    await ui.press({ key })
    await ui.unmount()
  }

  test('a command that runs no tests opens no market and passes through as it ran', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const toasts = toastsOf(on)
    answering(on, Fixtures.PASSED)

    await $.session.start(Fixtures.SESSION)
    const ran = await $.tool.call({ tool: 'Bash', command: 'git status' })

    expect(ran).toEqual(Fixtures.PASSED)
    expect(await bandText($), 'the band draws nothing of ours').toBe('')
    expect(toasts).toEqual([])
  })

  test('the tool is reached before the market reads anything', async ($, on) => {
    const order: string[] = []
    Fixtures.inSession(on)
    on('store.get', ($, e) => {
      order.push(`store.get ${e.key}`)

      return { value: undefined }
    })
    on('store.set', () => ({ value: undefined }))
    on('tool.call', () => {
      order.push('tool')

      return Fixtures.PASSED
    })

    await $.session.start(Fixtures.SESSION)
    order.length = 0
    await $.tool.call({ tool: 'Bash', command: 'npm test' })

    expect(order[0]).toBe('tool')
    expect(order).toContain('store.get history:/work')
  })

  test('a test run with no bet passes through as it ran and wagers nothing', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const toasts = toastsOf(on)
    answering(on, Fixtures.FAILED)

    await $.session.start(Fixtures.SESSION)
    const ran = await $.tool.call({ tool: 'Bash', command: 'npm test' })

    expect(ran).toEqual(Fixtures.FAILED)
    expect(toasts).toEqual([])
    expect(await paneText($)).toContain('BANKROLL   $1,000')
  })

  test('a market opens on every surface while the tests run, at even odds with no history', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached

    for (const surface of Fixtures.SURFACES) {
      const text = await bandText($, surface)
      expect(text).toContain('$ TESTS RUNNING   npm test')
      expect(text).toContain('Will they pass?')
      expect(text).toContain('✓ PASS x1.90')
      expect(text).toContain('✕ FAIL x1.90')
    }

    tool.release(Fixtures.PASSED)
    await call
  })

  test('a bet on pass placed while the tests run wins on exit code 0', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    const toasts = toastsOf(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    await press($, 'bet-pass')
    expect(await bandText($)).toContain('> YOUR BET  $100 on ✓ PASS at x1.90')

    tool.release(Fixtures.PASSED)
    // the result is held while the reels stop, and the toast waits for the stamp
    await clock.advance(7_000)
    const ran = await call

    expect(ran).toEqual(Fixtures.PASSED)
    expect(toasts).toEqual(['✓ CASHED OUT. Tests passed, +$90.'])
    expect(await paneText($)).toContain('BANKROLL   $1,090')
  })

  test('a bet on pass loses on a non-zero exit code, and the failure still reaches Claude', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    const toasts = toastsOf(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'pytest' })
    await tool.reached
    await press($, 'bet-pass')
    tool.release(Fixtures.FAILED)
    // the result is held while the reels stop, and the toast waits for the stamp
    await clock.advance(7_000)

    expect(await call).toEqual(Fixtures.FAILED)
    expect(toasts).toEqual(['✕ BUSTED. Tests failed, -$100.'])
    expect(await paneText($)).toContain('BANKROLL   $900')
  })

  test('a bet placed between runs stands for the next run', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    const toasts = toastsOf(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const first = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    tool.release(Fixtures.FAILED)
    await first

    expect(await bandText($)).toContain('$ NEXT RUN   Last run ✕ failed   Will they pass?')
    await press($, 'bet-fail')
    const standing = await bandText($)
    expect(standing, 'a standing bet can be cancelled by key').toContain('c: Cancel bet')
    expect(standing).toContain('ctrl+x tab: c cancel')

    const second = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    tool.release(Fixtures.FAILED)
    // the result is held while the reels stop, and the toast waits for the stamp
    await clock.advance(7_000)
    await second

    // one fail on record: pass chance 1/3, fail pays 0.95 / (2/3) = 1.425, so 1.42: 100 pays 142
    expect(toasts).toEqual(['✓ CASHED OUT. Tests failed, +$42.'])
  })

  test('a bet waiting for the next run can be cancelled, and its stake comes back', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    answering(on, Fixtures.PASSED)

    await $.session.start(Fixtures.SESSION)
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await press($, 'bet-pass')
    expect(await paneText($)).toContain('BANKROLL   $900')

    await press($, 'cancel')

    const text = await paneText($)
    expect(text).toContain('BANKROLL   $1,000')
    expect(text).toContain('No open bet.')
  })

  test('a bet on a run in flight cannot be cancelled', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    await press($, 'bet-pass')

    const ui = await $.ui.mount({
      plugin: Fixtures.PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      props: Fixtures.BAND_PROPS,
    })
    expect(await ui.find({ key: 'cancel' })).toBeUndefined()
    await ui.unmount()

    tool.release(Fixtures.PASSED)
    await call
  })

  test('a run that never reached an exit code hands the stake back', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    const toasts = toastsOf(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'go test ./...' })
    await tool.reached
    await press($, 'bet-fail')
    tool.release(Fixtures.INTERRUPTED)
    // the result is held while the reels stop, and the toast waits for the stamp
    await clock.advance(7_000)
    await call

    expect(toasts).toEqual(['· REFUNDED. The run never finished, $100 back.'])
    expect(await paneText($)).toContain('BANKROLL   $1,000')
  })

  test("the project's record in the store sets the odds", async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on, { 'history:/work': { passes: 3, fails: 1 } })
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'cargo test' })
    await tool.reached

    const text = await bandText($)
    expect(text).toContain('✓ PASS x1.42')
    expect(text).toContain('✕ FAIL x2.85')

    tool.release(Fixtures.PASSED)
    await call
  })

  test('the bankroll carries over from the store into /bankroll', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on, {
      bank: {
        balance: 1234,
        pnl: 234,
        wins: 3,
        losses: 1,
        voids: 0,
        bailouts: 0,
        streak: 1,
        bestStreak: 3,
        recent: [
          { side: 'fail', stake: 100, multiplier: 2.85, outcome: 'fail', delta: 185, command: 'pytest' },
        ],
      },
    })

    await $.session.start(Fixtures.SESSION)
    const text = await paneText($)

    expect(text).toContain('BANKROLL   $1,234   P&L ▴ +$234')
    expect(text).toContain('Bets          3 won · 1 lost · 0 void · win rate 75%')
    expect(text).toContain('▴ +$185     ✕ FAIL at x2.85, failed: pytest')
    expect(text).toContain('Rank          Weekend punter')
    expect(text).toContain('Best streak   ▴▴▴ 3 wins in a row')
  })

  test('a bankroll below one stake offers a bailout instead of bets', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on, {
      bank: { balance: 40, pnl: -960, wins: 0, losses: 10, voids: 0, bailouts: 0, recent: [] },
    })
    answering(on, Fixtures.FAILED)

    await $.session.start(Fixtures.SESSION)
    await $.tool.call({ tool: 'Bash', command: 'npm test' })

    const ui = await $.ui.mount({
      plugin: Fixtures.PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      props: Fixtures.BAND_PROPS,
    })
    expect(await ui.find({ key: 'bet-pass' })).toBeUndefined()
    expect((await ui.find({ key: 'bailout' }))?.props.hotkey).toBe('b')
    expect(await bandText($)).toContain('ctrl+x tab: b bailout')
    await ui.press({ key: 'bailout' })
    await ui.unmount()

    const text = await paneText($)
    expect(text).toContain('BANKROLL   $1,000')
    expect(text).toContain('Bailouts      1')
  })

  test('a run piped through tail opens a market and settles on the summary it printed, not the exit code', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    const toasts = toastsOf(on)
    const tool = Fixtures.heldTool(on)
    const piped = Fixtures.pipedResult(RUNNER_OUTPUT.bun.fail.output)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'bun test 2>&1 | tail -30' })
    await tool.reached
    await untilRunning($)
    await press($, 'bet-fail')
    tool.release(piped)
    // the result is held while the reels stop, and the toast waits for the stamp
    await clock.advance(7_000)

    expect(await call, 'Claude still gets the run exactly as it ran').toEqual(piped)
    expect(toasts).toEqual(['✓ CASHED OUT. Tests failed, +$90.'])
  })

  test('a run piped through head opens no market: head drops the summary', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    answering(on, Fixtures.PASSED)

    await $.session.start(Fixtures.SESSION)
    await $.tool.call({ tool: 'Bash', command: 'pytest 2>&1 | head -40' })

    expect(await bandText($), 'the band draws nothing of ours').toBe('')
  })

  test('a run in the background opens no market: its exit code comes later', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    answering(on, Fixtures.PASSED)

    await $.session.start(Fixtures.SESSION)
    await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })

    expect(await bandText($), 'the band draws nothing of ours').toBe('')
  })

  test('a win stamps the band with the cash-out for a few seconds, then the stamp goes', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    await press($, 'bet-pass')
    tool.release(Fixtures.PASSED)
    // the result is held while the reels stop
    await clock.advance(2_500)
    await call

    const won = await bandText($)
    expect(won).toContain('✓ CASHED OUT. +$90.   paid $190   bankroll $1,090')
    // the stamp's first row: C, A and S of CASHED in ANSI Shadow
    expect(won).toContain(' ██████╗ █████╗ ███████╗')

    // the show (reels, tally, stamp) lasts seven seconds
    await clock.advance(4_499)
    expect(await bandText($), 'still up just before seven seconds').toContain('✓ CASHED OUT. +$90.')

    await clock.advance(1)
    expect(await bandText($)).not.toContain('CASHED OUT')
  })

  test('a loss stamps the band BUSTED with the stake it cost', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    await press($, 'bet-pass')
    tool.release(Fixtures.FAILED)
    await call

    expect(await bandText($)).toContain('✕ BUSTED. -$100.')
  })

  test('a void run stamps the band REFUNDED', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    await press($, 'bet-fail')
    tool.release(Fixtures.INTERRUPTED)
    await call

    expect(await bandText($)).toContain('· REFUNDED. $100 back.')
  })

  /** The slot machine on screen for the run in flight: the band tall enough for the reels, kept mounted. */
  async function machine($: Engine) {
    return $.ui.mount({ plugin: Fixtures.PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: Fixtures.SLOTS_BAND_PROPS })
  }

  test('with a bet on and the reels on screen, the result reaches Claude only once the reels report they stopped, unchanged', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    mock.clock(on)
    on('ui.toast', () => ({ value: undefined }))
    on('audio.play', () => ({ value: undefined }))
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    let answered: ToolCallResult | null = null
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' }).then(ran => {
      answered = ran
    })
    await tool.reached
    const ui = await machine($)
    await ui.advance(200)
    await ui.press({ key: 'bet-fail' })
    tool.release(Fixtures.FAILED)

    // the reels take over two seconds of the machine's own time to stop
    await ui.advance(1_500)
    expect(answered, 'held while the reels stop').toBeNull()

    await ui.advance(3_000)
    await call
    await ui.unmount()
    expect(JSON.stringify(answered), 'byte for byte the tool result').toBe(JSON.stringify(Fixtures.FAILED))
  })

  test('the hold never passes two and a half seconds, even if the reels never report', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    on('ui.toast', () => ({ value: undefined }))
    on('audio.play', () => ({ value: undefined }))
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    let answered: ToolCallResult | null = null
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' }).then(ran => {
      answered = ran
    })
    await tool.reached
    const ui = await machine($)
    await ui.advance(200)
    await ui.press({ key: 'bet-fail' })
    tool.release(Fixtures.FAILED)

    // the machine's clock stands still: only the cap can release the result
    await clock.advance(2_499)
    expect(answered).toBeNull()
    await clock.advance(1)
    await call
    await ui.unmount()
    expect(answered).toEqual(Fixtures.FAILED)
  })

  test('with no bet on, the result is not held at all', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    mock.clock(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const ui = await machine($)
    await ui.advance(200)
    tool.release(Fixtures.PASSED)

    // no clock moves: nothing is waiting
    expect(await call).toEqual(Fixtures.PASSED)
    await ui.unmount()
  })

  test('with no reels on screen, a bet holds nothing and the toast comes at once: the compact band shows the result itself', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    mock.clock(on)
    const toasts = toastsOf(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    await press($, 'bet-pass')
    tool.release(Fixtures.PASSED)

    expect(await call).toEqual(Fixtures.PASSED)
    expect(toasts).toEqual(['✓ CASHED OUT. Tests passed, +$90.'])
  })

  test('the toast and the coin wait for the stamp the machine lands, not for a timer', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    const toasts = toastsOf(on)
    const sounds = soundsOf(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const ui = await machine($)
    await ui.advance(200)
    await ui.press({ key: 'bet-pass' })
    tool.release(Fixtures.PASSED)
    // a frame for the settled props to reach the machine, then the reels stop
    await ui.advance(100)
    await ui.advance(3_000)
    await call

    // the host's clock runs far ahead; the machine is still mid-tally
    await clock.advance(6_000)
    expect(toasts, 'no spoiler in the footer').toEqual([])
    expect(sounds, 'nor by ear').toEqual([])

    // the machine lands the stamp
    await ui.advance(4_000)
    await ui.unmount()
    expect(toasts).toEqual(['✓ CASHED OUT. Tests passed, +$90.'])
    expect(sounds).toEqual(['sounds/coin.wav'])
  })

  test('the stamp stays up a few seconds after the machine lands it, however slow the machine ran', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    on('ui.toast', () => ({ value: undefined }))
    on('audio.play', () => ({ value: undefined }))
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const ui = await machine($)
    await ui.advance(200)
    await ui.press({ key: 'bet-pass' })
    tool.release(Fixtures.PASSED)
    await ui.advance(100)
    await ui.advance(3_000)
    await call
    const shown = async () => (await Fixtures.layOut(ui)).lines.join('\n')

    // the host's clock is well past any fixed timer, the machine still mid-tally: nothing is taken down
    await clock.advance(10_000)
    expect(await shown(), 'the tally is still up').not.toContain('$ NEXT RUN')

    // the machine lands the stamp: it holds a few seconds, then the market comes back
    await ui.advance(4_000)
    await clock.advance(3_000)
    expect(await shown(), 'the stamp holds three seconds at least').toContain('CASHED OUT')
    await clock.advance(1_000)
    expect(await shown(), 'then the market comes back').toContain('$ NEXT RUN')
    await ui.unmount()
  })

  test('a run with no bet stamps nothing', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    answering(on, Fixtures.PASSED)

    await $.session.start(Fixtures.SESSION)
    await $.tool.call({ tool: 'Bash', command: 'npm test' })

    const text = await bandText($)
    expect(text).not.toContain('CASHED OUT')
    expect(text).not.toContain('BUSTED')
    expect(text).not.toContain('REFUNDED')
  })

  test('two wins in a row show on the band as a streak', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    for (const _ of [1, 2]) {
      const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
      await tool.reached
      await untilRunning($)
      await press($, 'bet-pass')
      tool.release(Fixtures.PASSED)
      await call
    }

    expect(await bandText($)).toContain('2 wins in a row')
  })

  test('two losses in a row show on the band as a losing streak', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    for (const _ of [1, 2]) {
      const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
      await tool.reached
      await untilRunning($)
      await press($, 'bet-pass')
      tool.release(Fixtures.FAILED)
      await call
    }

    expect(await bandText($)).toContain('2 losses in a row')
  })

  test('a win plays the coin, a loss the trombone, and a void or no bet plays nothing', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const clock = mock.clock(on)
    const sounds = soundsOf(on)
    const tool = Fixtures.heldTool(on)
    const settled = [
      { press: 'bet-pass', ran: Fixtures.PASSED },
      { press: 'bet-pass', ran: Fixtures.FAILED },
      { press: 'bet-pass', ran: Fixtures.INTERRUPTED },
      { press: null, ran: Fixtures.PASSED },
    ]

    await $.session.start(Fixtures.SESSION)
    for (const run of settled) {
      const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
      await tool.reached
      await untilRunning($)
      if (run.press !== null) {
        await press($, run.press)
      }
      tool.release(run.ran)
      // the sound waits for the stamp
      await clock.advance(7_000)
      await call
    }

    expect(sounds).toEqual(['sounds/coin.wav', 'sounds/trombone.wav'])
  })


  test('the first market taunts with the house line, and the next run gets a different one', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const first = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const firstBand = await bandText($)
    tool.release(Fixtures.PASSED)
    await first

    const second = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const secondBand = await bandText($)
    tool.release(Fixtures.PASSED)
    await second

    expect(firstBand).toContain('The house has seen your test suite. The house is confident.')
    expect(secondBand).not.toContain('The house has seen your test suite. The house is confident.')
  })

  test("the project's record picks the taunt: four runs on record, the fifth line of the table", async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on, { 'history:/work': { passes: 3, fails: 1 } })
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const text = await bandText($)
    tool.release(Fixtures.PASSED)
    await call

    expect(text).toContain('$ TESTS RUNNING   npm test')
    expect(text).toContain('Bold of you to assume the mocks are mocking.')
  })

  test('the odds and the bankroll are drawn in color: pass in the win color, fail in the loss color, money in gold', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const look = await bandLook($)
    tool.release(Fixtures.PASSED)
    await call

    expect(look.colorOf('✓ PASS x1.90')).toBe(Art.PALETTE.up)
    expect(look.colorOf('✕ FAIL x1.90')).toBe(Art.PALETTE.down)
    expect(look.colorOf('$1,000')).toBe(Art.PALETTE.gold)
  })

  test('the band stays within four rows in every state it can be in', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on, { bank: { balance: 150, pnl: -850, wins: 0, losses: 8, voids: 0, bailouts: 0, recent: [] } })
    const tool = Fixtures.heldTool(on)
    const rows: number[] = []

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    rows.push((await bandLook($)).rows)
    await press($, 'bet-pass')
    rows.push((await bandLook($)).rows)
    tool.release(Fixtures.FAILED)
    await call
    rows.push((await bandLook($)).rows)

    expect(rows.length).toBe(3)
    for (const count of rows) {
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThanOrEqual(4)
    }
  })


  test('between runs the band says ctrl+x tab: Claude has usually filled the prompt with a suggestion, and a digit would go there', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    tool.release(Fixtures.FAILED)
    await call

    const text = await bandText($)
    expect(text).toContain('$ NEXT RUN')
    expect(text).toContain('ctrl+x tab: 1 pass · 2 fail')
    expect(text).not.toContain('empty prompt')
  })

  test('/bankroll labels its sections in bold capitals, as the band does', async ($, on) => {
    Fixtures.inSession(on)
    const bet = { side: 'pass' as const, stake: 100, multiplier: 1.9, outcome: 'pass' as const, delta: 90, command: 'npm test' }
    mock.store(on, { bank: { ...Fixtures.SESSION_BANK, recent: [bet] } })

    await $.session.start(Fixtures.SESSION)
    const text = await paneText($)

    expect(text).toContain('LAST BETS')
    expect(text).not.toContain('Last bets')
  })

  test('/bankroll opens titled after the mod, asking the dock for room enough for its chart', async ($, on) => {
    const opened: unknown[] = []
    Fixtures.inSession(on, opened)
    mock.store(on, { bank: Fixtures.SESSION_BANK })

    await $.session.start(Fixtures.SESSION)
    await $.command.run(Fixtures.BANKROLL)

    expect(opened).toEqual([expect.objectContaining({ id: 'bankroll', title: 'pass-or-bust · bankroll', columns: 64 })])
  })

  test('/bankroll puts the rank right under the balance, above the chart: an inline pane may show only its first rows', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on, { bank: Fixtures.SESSION_BANK })

    await $.session.start(Fixtures.SESSION)
    const lines = (await paneText($)).split('\n')
    const rankAt = lines.findIndex(line => line.includes('Rank'))
    const chartAt = lines.findIndex(line => line.includes('┤'))

    expect(rankAt, 'the rank is drawn').toBeGreaterThan(-1)
    expect(rankAt, 'within the first rows').toBeLessThan(4)
    expect(chartAt === -1 || rankAt < chartAt, 'above the chart').toBe(true)
  })

  test('the bet buttons answer 1 and 2 typed at an empty prompt, and the band says so', async ($, on) => {
    Fixtures.inSession(on)
    mock.store(on)
    const tool = Fixtures.heldTool(on)

    await $.session.start(Fixtures.SESSION)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await tool.reached
    const ui = await $.ui.mount({
      plugin: Fixtures.PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      props: Fixtures.BAND_PROPS,
    })
    const pass = await ui.find({ key: 'bet-pass' })
    const fail = await ui.find({ key: 'bet-fail' })
    await ui.unmount()
    const text = await bandText($)
    tool.release(Fixtures.PASSED)
    await call

    expect(pass?.props.hotkey).toBe('1')
    expect(fail?.props.hotkey).toBe('2')
    expect(text).toContain('empty prompt: 1 pass · 2 fail')
  })

})
