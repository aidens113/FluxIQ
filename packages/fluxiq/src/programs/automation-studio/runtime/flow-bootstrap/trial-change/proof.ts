// What a trial proves of one task part (t775), from the part's typed effect
// and the deltas of its witnesses. Pure.
//
// - No typed effect: `none`; the judge decides the part from the run alone.
// - `change`: `shown` when any witness changed (the direction and the unit
//   arithmetic are the judge's: Core does not parse page quantities); otherwise
//   `unproven` while any witness is unread (the change may be where nothing was
//   read), and `no_change` only when every witness was read and none changed.
//   A part with no witness at all is `unproven`.
// - `end_state`: `shown` when any witness changed; otherwise `unproven` while
//   any is unread; when every witness was read unchanged and one of them is a
//   control (the place the state itself shows), the state held before the
//   trial, so the run proves it only as `carried` (the same step was seen
//   making this change earlier in the build), else `already_in_end_state`,
//   which can never be a yes. Unchanged lists alone are `unproven`: a list a
//   step's effect could reach (a basket behind a button that opens a checkout)
//   says nothing about whether the asked state held before, which the judge
//   reads from the run and its end view (t775 integration).
//
// Design section 3 words `no_change` as "every witness shows change: none"; a
// read-unchanged witness beside an unread one is therefore `unproven`, never a
// grounded no.

import type { AutomationStudioTrialActOutcome, AutomationStudioTrialDelta, AutomationStudioTrialPartEffect, AutomationStudioTrialPartProof } from "./contracts.ts";

/** One part's proof from its witnesses' deltas, its acts (their steps are carried into the proof), and whether the same step was seen making this change earlier in the build. */
export function automationStudioTrialPartProof(input: {
  part: { id: string; effect?: AutomationStudioTrialPartEffect | undefined };
  deltas: readonly AutomationStudioTrialDelta[];
  acts: readonly AutomationStudioTrialActOutcome[];
  carried: boolean;
}): AutomationStudioTrialPartProof {
  const { part, deltas, acts, carried } = input;
  const steps = [...new Set(acts.filter((act) => act.parts.includes(part.id)).map((act) => act.step))].sort((left, right) => left - right);
  if (!part.effect) return { part: part.id, proof: "none", steps };
  const base = { part: part.id, effect: part.effect, steps };
  if (deltas.some((delta) => delta.status === "changed")) return { ...base, proof: "shown" };
  if (!deltas.length || deltas.some((delta) => delta.status === "unread")) return { ...base, proof: "unproven" };
  if (part.effect.kind === "change") return { ...base, proof: "no_change" };
  if (!deltas.some((delta) => delta.kind === "control")) return { ...base, proof: "unproven" };
  return { ...base, proof: carried ? "carried" : "already_in_end_state" };
}
