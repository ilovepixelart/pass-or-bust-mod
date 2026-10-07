import { describe, expect, test, tier } from 'claude-code/testing'

import Stored from '../../hooks/stored'

tier('user')

describe('stored', () => {
  test('a store with no layout is a store from before layouts, read as it is', () => {
    expect(Stored.layoutOf(undefined)).toBe('legacy')
  })

  test('layout 1 is the layout this release writes', () => {
    expect(Stored.LAYOUT).toBe(1)
    expect(Stored.layoutOf(1)).toBe('current')
  })

  test('a newer layout, or one this release cannot make sense of, is not read', () => {
    for (const stored of [2, 7, 1.5, 0, -1, '1', null, { layout: 1 }]) {
      expect(Stored.layoutOf(stored), JSON.stringify(stored)).toBe('unreadable')
    }
  })
})
