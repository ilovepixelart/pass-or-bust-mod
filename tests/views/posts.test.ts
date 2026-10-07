import { describe, expect, test, tier } from 'claude-code/testing'

import Views from '../../hooks/views'
import type { SlotsPost, SlotsProps } from '../../hooks/views'

tier('user')

const WIN = { kind: 'win', stake: 100, paid: 190, delta: 90, from: 900, to: 1090, streak: 1, coins: 0 } as const

function props(result: SlotsProps['result']): SlotsProps {
  return { run: 7, command: 'npm test', slip: null, result, isBroke: false, sideColumns: 30, columns: 120 }
}

/** Walks the machine's clock in 40 ms frames, sending each post that falls due, as the surface module does. */
function postsUntil(shown: SlotsProps, settledAt: number | null, until: number): { at: number; post: SlotsPost }[] {
  const sent = new Set<SlotsPost['event']>()
  const posts: { at: number; post: SlotsPost }[] = []
  for (let time = 40; time <= until; time += 40) {
    const due = Views.postDueOf(shown, { time, settledAt }, sent)
    if (due !== null) {
      sent.add(due.event)
      posts.push({ at: time, post: due })
    }
  }

  return posts
}

describe('posts', () => {
  test('a spinning machine says it is on screen once, and nothing more until the run settles', () => {
    const posts = postsUntil(props(null), null, 10_000)

    expect(posts.map(p => p.post)).toEqual([{ event: 'spinning', run: 7 }])
  })

  test('a settled bet: on screen, then reels stopped once they really have, then the stamp down after the tally', () => {
    const settledAt = 1_000
    const posts = postsUntil(props({ outcome: 'pass', payout: WIN, seconds: 6 }), settledAt, 20_000)

    expect(posts.map(p => p.post.event)).toEqual(['spinning', 'stopped', 'landed'])
    const stopped = posts[1]?.at ?? 0
    const landed = posts[2]?.at ?? 0
    // the reels take a beat to stop (the third reel teases), but well inside the two and a half second hold:
    // the machine's frames run about a quarter slower than the wall clock, so 2.0 s here is about 2.5 s on screen
    expect(stopped - settledAt).toBeGreaterThanOrEqual(1_500)
    expect(stopped - settledAt).toBeLessThan(2_000)
    expect(landed - stopped).toBeGreaterThan(2_000)
  })

  test('a run with no bet stops its reels but lands no stamp', () => {
    const posts = postsUntil(props({ outcome: 'fail', payout: null, seconds: 6 }), 1_000, 20_000)

    expect(posts.map(p => p.post.event)).toEqual(['spinning', 'stopped'])
  })

  test('the host reads back only well formed posts', () => {
    expect(Views.slotsPostOf({ event: 'stopped', run: 3 })).toEqual({ event: 'stopped', run: 3 })
    expect(Views.slotsPostOf({ event: 'stopped', run: '3' })).toBeNull()
    expect(Views.slotsPostOf({ event: 'jackpot', run: 3 })).toBeNull()
    expect(Views.slotsPostOf(null)).toBeNull()
    expect(Views.slotsPostOf('stopped')).toBeNull()
  })
})
