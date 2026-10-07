import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import Bankroll from './bankroll'
import Detect from './detect'
import Limits from './limits'
import Market from './market'
import type { Action, Change } from './market'
import Odds from './odds'
import Settle from './settle'
import Stored from './stored'
import Views from './views'
import Words from './words'

const PANE = 'bankroll'

/** The dock width /bankroll asks for: its whole chart and ledger, unwrapped. */
const DOCK_COLUMNS = 64

const SOUNDS = { win: 'sounds/coin.wav', loss: 'sounds/trombone.wav' } as const

/** The session's market: null until Claude first runs the tests. */
const marketAtom = atom({ plugin: 'pass-or-bust', key: 'market' } as const, null)

/** The bet waiting on the next settlement, if any. */
const slipAtom = atom({ plugin: 'pass-or-bust', key: 'slip' } as const, null)

/** The bankroll as the store last saved it. */
const bankAtom = atom({ plugin: 'pass-or-bust', key: 'bank' } as const, Bankroll.NEW_BANK)

/** Whether the person hid the band until the next test run. */
const isHiddenAtom = atom({ plugin: 'pass-or-bust', key: 'isHidden' } as const, false)

/** The last settled bet's result, while the band still shows it. */
const stampAtom = atom({ plugin: 'pass-or-bust', key: 'stamp' } as const, null)

/** The run the slot machine is showing, from its start until its show is over. */
const slotsAtom = atom({ plugin: 'pass-or-bust', key: 'slots' } as const, null)

/** Sound and timers are decoration: a refusal or an unanswered call must not reach the run. */
const quietly = (pending: Promise<unknown>) => {
  pending.catch(() => undefined)
}

/** What a settled bet announces once its stamp is down: the toast line, and the sound (none for a void). */
type Announcement = { toast: string; sound: string | null }

/**
 * What the machine on screen has told the host about one run: whether it is
 * on screen, a promise the run's hook waits on for its reels to stop, the
 * announcement held for the moment its stamp lands, and that stamp's id.
 */
type Seen = { isOnScreen: boolean; stopped: Promise<void>; stop: () => void; held: Announcement | null; stampId: number | null }

function seenOf(): Seen {
  let stop = () => {}
  const stopped = new Promise<void>(resolve => {
    stop = resolve
  })

  return { isOnScreen: false, stopped, stop, held: null, stampId: null }
}

/** The toast and the sound of a settled bet. */
function announce($: { ui: { toast: (text: string) => unknown }; audio: { play: (clip: { asset: string }) => Promise<unknown> } }, announcement: Announcement) {
  quietly(Promise.resolve($.ui.toast(announcement.toast)))
  if (announcement.sound !== null) {
    quietly($.audio.play({ asset: announcement.sound }))
  }
}

/** Saves entries in this release's layout, the layout key first: the store is only ever written in one layout. */
async function save($: { store: { set: (key: string, value: unknown) => Promise<void> } }, entries: readonly (readonly [string, unknown])[]) {
  await $.store.set(Stored.LAYOUT_KEY, Stored.LAYOUT)
  for (const [key, value] of entries) {
    await $.store.set(key, value)
  }
}

export const register: Register = on => {
  let historyKey = Stored.historyKeyOf(null)
  let lastStampId = 0
  let lastRunId = 0
  // a store saved in a layout this release cannot read is left exactly as it is: no market, no writes
  let isLocked = false
  const seen = new Map<number, Seen>()

  on('session.start', async ($, e, next) => {
    historyKey = Stored.historyKeyOf(e.cwd)
    await $.command.register({
      name: 'bankroll',
      description: 'Your pass-or-bust bankroll: balance, lifetime P&L and recent bets',
    })

    isLocked = Stored.layoutOf(await $.store.get(Stored.LAYOUT_KEY)) === 'unreadable'
    if (isLocked) {
      quietly(Promise.resolve($.ui.toast(Words.NEWER_LAYOUT, { timeoutMs: 15_000 })))

      return next(e)
    }

    const bank = Stored.bankOf(await $.store.get(Stored.BANK_KEY))
    const slip = Stored.slipOf(await $.store.get(Stored.SLIP_KEY))
    await update($, bankAtom, () => bank)
    await update($, slipAtom, () => slip)

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const testRun = e.run_in_background === true || isLocked ? null : Detect.testRunOf(e.command)
    if (testRun === null) {
      return next(e)
    }

    // the run starts before the market opens: betting never holds up the tests
    const running = next(e)
    // a new run replaces the last stamp, so the next bet can be placed at once
    await update($, stampAtom, () => null)
    lastRunId += 1
    const runId = lastRunId
    const machine = seenOf()
    seen.set(runId, machine)
    const startedAt = await $.clock.now().catch(() => null)
    await update($, slotsAtom, () => ({ id: runId, settled: null }))

    const before = Stored.historyOf(await $.store.get(historyKey))
    await update($, marketAtom, () => ({
      command: e.command,
      odds: Odds.oddsOf(before),
      passChance: Odds.passChanceOf(before),
      isRunning: true,
      last: null,
      runs: before.passes + before.fails,
    }))
    await update($, isHiddenAtom, () => false)

    const ran = await running
    const outcome = testRun.isPiped ? Settle.pipedOutcomeOf(ran, testRun.family) : Settle.outcomeOf(ran)

    const after = Odds.recordOf(Stored.historyOf(await $.store.get(historyKey)), outcome)
    await save($, [[historyKey, after]])
    const market = await update($, marketAtom, () => ({
      command: e.command,
      odds: Odds.oddsOf(after),
      passChance: Odds.passChanceOf(after),
      isRunning: false,
      last: outcome,
      runs: after.passes + after.fails,
    }))

    const table = { market, slip: await read($, slipAtom), bank: await read($, bankAtom) }
    const settled = Market.settlementOf(table, outcome, e.command)

    // the reels stop on this outcome: the machine only shows what settled
    const endedAt = startedAt === null ? null : await $.clock.now().catch(() => null)
    const seconds = startedAt === null || endedAt === null ? null : Math.floor((endedAt - startedAt) / 1000)
    await update($, slotsAtom, run => (run?.id === runId ? { id: runId, settled: { outcome, slip: table.slip, seconds } } : run))
    // a machine on screen takes its show down a hold after it lands the stamp, however slowly it ran; this is
    // the fallback for one that never says so
    const showMs = settled === null ? Limits.SLOTS_NO_BET_MS : machine.isOnScreen ? Limits.STAMP_FALLBACK_MS : Limits.STAMP_MS
    $.clock.after(showMs, () => quietly(update($, slotsAtom, run => (run?.id === runId ? null : run))))

    if (settled !== null) {
      await update($, bankAtom, () => settled.bank)
      await update($, slipAtom, () => settled.slip)
      await save($, [
        [Stored.BANK_KEY, settled.bank],
        [Stored.SLIP_KEY, settled.slip],
      ])
      lastStampId += 1
      const id = lastStampId
      await update($, stampAtom, () => ({ id, ...settled.stamp }))
      machine.stampId = id
      $.clock.after(machine.isOnScreen ? Limits.STAMP_FALLBACK_MS : Limits.STAMP_MS, () =>
        quietly(update($, stampAtom, stamp => (stamp?.id === id ? null : stamp))),
      )

      // the toast and the sound wait for the stamp the machine lands: neither may give the result away while
      // the reels turn; with no machine on screen the band shows the result at once, and so do they
      const kind = settled.stamp.outcome === 'void' ? 'void' : settled.stamp.delta > 0 ? 'win' : 'loss'
      const announcement = { toast: settled.toast, sound: kind === 'void' ? null : kind === 'win' ? SOUNDS.win : SOUNDS.loss }
      if (machine.isOnScreen) {
        // made by the ui.message hook that hears the stamp land, with its own $
        machine.held = announcement
      } else {
        announce($, announcement)
      }
    }

    if (table.slip !== null && machine.isOnScreen) {
      // a bet is on and the reels are turning: the transcript would show the result before they stop, so
      // hold it, unchanged, until the machine says they stopped, and never past the cap
      const cap = $.clock.sleep(Limits.RESULT_HOLD_MOST_MS, { signal: next.signal })
      await Promise.race([machine.stopped, cap]).catch(() => undefined)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.message', ($, e, next) => {
    const post = Views.slotsPostOf(e.data)
    const machine = post === null ? undefined : seen.get(post.run)
    if (post !== null && machine !== undefined) {
      if (post.event === 'spinning') {
        machine.isOnScreen = true
      } else if (post.event === 'stopped') {
        machine.stop()
      } else {
        if (machine.held !== null) {
          announce($, machine.held)
        }
        const { stampId } = machine
        $.clock.after(Limits.STAMP_HOLD_MS, () => {
          quietly(update($, slotsAtom, run => (run?.id === post.run ? null : run)))
          quietly(update($, stampAtom, stamp => (stamp !== null && stamp.id === stampId ? null : stamp)))
        })
        seen.delete(post.run)
      }
    }

    return next(e)
  })

  on('command.run', { command: 'bankroll' }, async $ => {
    await $.ui.open({ id: PANE, title: 'pass-or-bust · bankroll', columns: DOCK_COLUMNS })

    return { text: 'Bankroll opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const market = await read($, marketAtom)
    const isQuiet = e.props.hasSurvey || market === null || (await read($, isHiddenAtom))

    if (isQuiet || e.surface === 'mobile' || e.surface === 'vscode') {
      return next(e)
    }

    const act = async (action: Action) => {
      const table = {
        market: await read($, marketAtom),
        slip: await read($, slipAtom),
        bank: await read($, bankAtom),
      }
      const change: Change | null = Market.changeOf(table, action)

      if (change !== null) {
        await update($, bankAtom, () => change.bank)
        await update($, slipAtom, () => change.slip)
        await save($, [
          [Stored.BANK_KEY, change.bank],
          [Stored.SLIP_KEY, change.slip],
        ])
      }
    }

    const elements = $.ui.resolve(e)
    const Client = 'Client' in elements ? elements.Client : undefined
    // the engine loads a surface module only from a literal path in this file
    const clients: Views.Clients = {
      // a declared size, so the engine knows where the bet buttons under the machine sit
      slots: (key, props) =>
        Client === undefined ? null : <Client key={key} module="./clients/slots.tsx" props={props} height={Views.SLOTS_ROWS} />,
      clock: key => (Client === undefined ? null : <Client key={key} module="./clients/run-clock.tsx" props={null} />),
      payout: (key, props) => (Client === undefined ? null : <Client key={key} module="./clients/payout.tsx" props={props} />),
    }

    return Views.band(
      elements,
      {
        market,
        slip: await read($, slipAtom),
        bank: await read($, bankAtom),
        stamp: await read($, stampAtom),
        slots: await read($, slotsAtom),
      },
      { act, hide: () => update($, isHiddenAtom, () => true) },
      { bodyColumns: e.props.bodyColumns, maxRows: e.props.maxRows },
      clients,
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface === 'mobile' || e.surface === 'vscode') {
      return next(e)
    }

    const elements = $.ui.resolve(e)
    const Client = 'Client' in elements ? elements.Client : undefined

    return Views.pane(
      elements,
      {
        bank: await read($, bankAtom),
        slip: await read($, slipAtom),
        history: Stored.historyOf(await $.store.get(historyKey)),
        bodyColumns: e.props.bodyColumns,
      },
      { chart: (key, props) => (Client === undefined ? null : <Client key={key} module="./clients/chart.tsx" props={props} />) },
    )
  })
}
