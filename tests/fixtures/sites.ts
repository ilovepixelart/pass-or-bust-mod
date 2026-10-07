import type { CommandRunInput, RenderPropsOf, SessionStartInput } from 'claude-code'

export const PLUGIN = 'pass-or-bust'

export const SESSION: SessionStartInput = {
  surface: 'terminal',
  isInteractive: true,
  cwd: '/work',
}

export const SURFACES = ['terminal', 'desktop'] as const

export const BAND_PROPS: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 12,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 11 },
  view: {},
}

export const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'pass-or-bust · bankroll',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

export const BANKROLL: CommandRunInput = {
  command: 'bankroll',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
}

/** A band tall enough for the slot machine: it needs about thirteen rows. */
export const SLOTS_BAND_PROPS: RenderPropsOf['AbovePrompt'] = { ...BAND_PROPS, maxRows: 30, scroll: { offset: 0, bodyRows: 29 } }

/** A bankroll some way into its life: what a store holds after a few dozen bets. */
export const SESSION_BANK = {
  balance: 1_200,
  pnl: 200,
  wins: 20,
  losses: 12,
  voids: 1,
  bailouts: 0,
  streak: 2,
  bestStreak: 5,
  recent: [],
}
