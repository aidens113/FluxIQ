// What a trial proves of one task part (t775), from the part's typed effect
// and the deltas of its witnesses. Pure.
//
// - No typed effect: `none`; the judge decides the part from the run alone.
// - `change`: `shown` when any witness changed (the direction and the unit
//   arithmetic are the judge's: Core does not parse page quantities); otherwise
//   `unproven` while any witness is unread (the change may be where nothing was
//   read), and `no_change` only when every witness was read and none changed.
//   A part with no witness at all is `unproven`.
// - `change` asking to add (t787): `contradicted` when any of its control
//   witnesses changed and was `returned` (`./delta.ts`): every state it moved
//   ended where the build found it, so the trial took back what an earlier act
//   had added. That is the opposite of the part's direction, whatever its
//   other witnesses show, and is never a yes (`./contradicted.ts`). A part
//   asking to remove is not read so: going back is what it asks. Lists carry
//   no direction here; the judge reads them from their counts and lines.
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
// - **Not run (t796), read first.** A part with a typed effect whose every
//   acting step (`./part-acting.ts`: the plan's lasting steps serving it) the
//   trial never ran on any pass -- a guard routed past it, or no pass reached
//   it -- is `not_run`, whatever its witnesses read: its act was not done, so
//   a `no_change` there would send the builder after the act's target when the
//   step itself never ran (debug `run-mvtdn37t-e1e4d0a7`). Its `notRun` names
//   those steps, their passes and why. A part whose acting steps were not run
//   on some passes only keeps the proof computed below and carries `notRun`
//   beside it. A part with no acting step, or whose acting steps have no
//   not-run entry, is read as before.
//
// Design section 3 words `no_change` as "every witness shows change: none"; a
// read-unchanged witness beside an unread one is therefore `unproven`, never a
// grounded no.

import type { AutomationStudioTrialActOutcome, AutomationStudioTrialDelta, AutomationStudioTrialNotRun, AutomationStudioTrialPartEffect, AutomationStudioTrialPartProof } from "./contracts.ts";

/** One part's proof from its witnesses' deltas, its acts (their steps are carried into the proof), whether the same step was seen making this change earlier in the build, and (t796) its acting steps with the passes each was not run on (header). */
export function automationStudioTrialPartProof(input: {
  part: { id: string; effect?: AutomationStudioTrialPartEffect | undefined };
  deltas: readonly AutomationStudioTrialDelta[];
  acts: readonly AutomationStudioTrialActOutcome[];
  carried: boolean;
  acting?: ReadonlyArray<{ notRun: readonly AutomationStudioTrialNotRun[] }> | undefined;
}): AutomationStudioTrialPartProof {
  const { part, deltas, acts, carried } = input;
  const acting = input.acting ?? [];
  const steps = [...new Set(acts.filter((act) => act.parts.includes(part.id)).map((act) => act.step))].sort((left, right) => left - right);
  if (!part.effect) return { part: part.id, proof: "none", steps };
  const notRun = acting.flatMap((step) => step.notRun.map((entry) => ({ ...entry, passes: [...entry.passes] })));
  const base = { part: part.id, effect: part.effect, steps, ...(notRun.length ? { notRun } : {}) };
  // Every acting step never ran on any pass: the act was not done, read first (header, t796).
  if (acting.length && acting.every((step) => neverRan(step.notRun))) return { ...base, proof: "not_run" };
  if (part.effect.kind === "change" && part.effect.direction === "adds" && deltas.some((delta) => delta.kind === "control" && delta.status === "changed" && delta.returned === true)) return { ...base, proof: "contradicted" };
  if (deltas.some((delta) => delta.status === "changed")) return { ...base, proof: "shown" };
  if (!deltas.length || deltas.some((delta) => delta.status === "unread")) return { ...base, proof: "unproven" };
  if (part.effect.kind === "change") return { ...base, proof: "no_change" };
  if (!deltas.some((delta) => delta.kind === "control")) return { ...base, proof: "unproven" };
  return { ...base, proof: carried ? "carried" : "already_in_end_state" };
}

/** Whether a step's not-run entries cover every pass it had: outside a repeat, any entry; inside one, all `of` passes. */
function neverRan(entries: readonly AutomationStudioTrialNotRun[]): boolean {
  if (!entries.length) return false;
  if (entries.some((entry) => entry.of === undefined)) return true;
  const passes = new Set(entries.flatMap((entry) => entry.passes));
  return entries.every((entry) => passes.size >= (entry.of ?? 0));
}
