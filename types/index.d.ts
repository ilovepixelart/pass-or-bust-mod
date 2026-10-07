export type Side = 'pass' | 'fail'

export type Odds = { pass: number; fail: number }

export type Slip = { side: Side; stake: number; multiplier: number }

export type Bet = Slip & {
  outcome: 'pass' | 'fail' | 'void'
  delta: number
  command: string
  /** The bankroll the bet left; absent on bets saved before it was kept. */
  balance?: number
}

export type Bank = {
  balance: number
  pnl: number
  wins: number
  losses: number
  voids: number
  bailouts: number
  /** Wins in a row when positive, losses in a row when negative. */
  streak: number
  /** The longest run of wins this bankroll has had. */
  bestStreak: number
  recent: Bet[]
}

/** The result the band shows for a few seconds after a bet settles. */
export type Stamp = {
  id: number
  outcome: 'pass' | 'fail' | 'void'
  stake: number
  paid: number
  delta: number
}

export type Market = {
  command: string
  odds: Odds
  /** The chance of a pass the odds were priced from: the band's gauge. */
  passChance: number
  isRunning: boolean
  last: 'pass' | 'fail' | 'void' | null
  /** The project's settled runs so far: picks the house's taunt. */
  runs: number
}

/** The slot machine's run: which run it is, and once it settled, how, and the bet that rode on it. */
export type SlotsRun = {
  id: number
  settled: {
    outcome: 'pass' | 'fail' | 'void'
    slip: Slip | null
    /** How long the run took, in whole seconds; null where the clock could not be read. */
    seconds: number | null
  } | null
}

declare module 'claude-code' {
  interface PluginState {
    'pass-or-bust': {
      market: Market | null
      slip: Slip | null
      bank: Bank
      isHidden: boolean
      stamp: Stamp | null
      slots: SlotsRun | null
    }
  }
}
