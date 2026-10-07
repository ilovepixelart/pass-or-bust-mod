/**
 * The colors the mod draws in: an Okabe and Ito palette, safe for the common
 * kinds of color blindness. No meaning rides on color alone: every outcome
 * also carries a glyph (✓ ✕ ▴ ▾) and a word.
 */
export const PALETTE = {
  /** A loss, a fail. */
  down: '#FF6B3D',
  /** A win, a pass. */
  up: '#56B4E9',
  /** Money, and a bet on the table. */
  gold: '#E69F00',
  /** The house's voice: taunts and ranks. */
  house: '#CC79A7',
  /** Labels and rules. */
  muted: '#8B93A6',
  /** The edges of the stamp's letters. */
  shadow: '#5A5F7A',
} as const
