// Who said a turn and when, for a screen reader and on hover: a visually
// hidden header on the turn and the time as its title. `turnMeta` turns it on;
// without it a turn is drawn by its author alone.

/** How a host words a turn's time. */
export type TurnMeta = { formatTime(ms: number): string };
