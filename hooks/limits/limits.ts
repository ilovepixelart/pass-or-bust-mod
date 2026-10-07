/** Credits a new bankroll, and a bailout, starts from. */
export const START_BALANCE = 1000

/** Credits one bet stakes. */
export const STAKE = 100

/** The house's cut of a fair price: 0.05 pays 1.90 on an even chance. */
export const EDGE = 0.05

/** The least a winning bet pays per credit staked, so a win always wins something. */
export const MIN_MULTIPLIER = 1.01

/** The most a winning bet pays per credit staked. */
export const MAX_MULTIPLIER = 50

/** How long the band shows a settled bet: the reels stopping, the tally and the stamp, in milliseconds. */
export const STAMP_MS = 7_000

/** How long the stamp stays up once the slot machine has landed it, in milliseconds. */
export const STAMP_HOLD_MS = 3_500

/** The longest a slot machine's show stays up if it never reports its stamp landing, in milliseconds. */
export const STAMP_FALLBACK_MS = 20_000

/** How long the stopped reels stay up after a run nobody bet on, in milliseconds. */
export const SLOTS_NO_BET_MS = 3_500

/** Settled bets the bankroll keeps: the /bankroll chart draws one bar each. */
export const RECENT_BETS = 15

/** The longest the house holds a test result back from Claude while the reels stop, in milliseconds. */
export const RESULT_HOLD_MOST_MS = 2_500
