/**
 * Humanness: one integer from 0 to 100 that says how human the run's input looks.
 * 0 is today's path exactly (no added waits, centre-first click points, synchronous
 * typing) and is the default because speed is the user's top priority; higher levels
 * randomise timing, click points, typing cadence, scroll dwell and inert misclicks
 * from a seeded generator.
 */
export const HUMANNESS_MIN = 0;
export const HUMANNESS_MAX = 100;
export const HUMANNESS_DEFAULT = 0;
