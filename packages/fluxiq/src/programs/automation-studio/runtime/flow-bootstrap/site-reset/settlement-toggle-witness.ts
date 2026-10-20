// Whether one press flipped exactly one control at its place (L1 reset
// settlement, `./settlement-control-tracker.ts`).
//
// A press on a stateful control -- a like, a follow, a save, a star -- leaves
// no item and often no list behind it: what it changed is the control's own
// state. The domain reports every read's stateful controls as counts of state
// tokens per place (`AutomationStudioSiteResetRead.controls`) and the pressed
// control's own state just before the press (`Spot.state`). The press is a
// toggle only when, at its place, exactly one control went from that state to
// exactly one other state and nothing else there moved: one fewer `state`, one
// more of the other, every other count equal. Anything else -- no change, two
// controls changing, a control appearing or vanishing -- is no toggle, and the
// act is left to its other witnesses. Pure; opaque tokens and counts only.

/** One control at a place that went from `from` to `to`. */
export type AutomationStudioSiteResetToggle = { from: string; to: string };

/** The toggle a press made at its place, from the counts just before and just after it; none unless exactly one control flipped. */
export function automationStudioSiteResetToggleWitness(input: {
  /** The pressed control's own state token just before the press. */
  state: string | undefined;
  before: Readonly<Record<string, number>> | undefined;
  after: Readonly<Record<string, number>> | undefined;
}): AutomationStudioSiteResetToggle | undefined {
  const { state, before, after } = input;
  if (!state || !before || !after || !counts(before) || !counts(after)) return undefined;
  const was = before[state] ?? 0;
  if (was < 1 || (after[state] ?? 0) !== was - 1) return undefined;
  let to: string | undefined;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === state) continue;
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (delta === 0) continue;
    if (delta !== 1 || to !== undefined) return undefined;
    to = key;
  }
  return to === undefined ? undefined : { from: state, to };
}

/** Every count a non-negative safe integer. */
function counts(value: Readonly<Record<string, number>>): boolean {
  return Object.values(value).every((count) => Number.isSafeInteger(count) && count >= 0);
}
