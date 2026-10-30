// A trial's `cannotUndo`, defaulted (framework-heavy-lifting plan, P4; report row 9).
//
// Core knows which acts the reset listed, so the model is not asked to echo
// them. A trial that omits `cannotUndo` gets only the acts Core itself closed as
// ones no call can settle (`gate_unsatisfiable`, listed apart as unsettleable):
// what Core says of an act must stay true, and an act still listed to undo may
// yet be undone through the site, so it is never defaulted into "the site offers
// no control to undo it". A model that supplies a list may only narrow it to
// acts Core listed (to undo, in place, or apart): an id Core never listed does
// not count. The trial gate and the subflow trial gate both ask through
// `automationStudioTrialDefaultsBeforeTrial`, so the two cannot drift; what was
// listed is remembered per reset. Generic: it reads act ids only.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetBeforeTrialOptions, AutomationStudioSiteResetDecision, AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";

/** Per reset: the ids its answers listed so far (`listed`), and those it listed as closed, unsettleable (`closed`), each in first-listed order. */
const memory = new WeakMap<AutomationStudioSiteResetTrialReset, { listed: Set<string>; closed: Set<string> }>();

/** Asks `reset` before a trial, with `cannotUndo` defaulted to the acts it closed and narrowed to the acts it listed when supplied (header). */
export async function automationStudioTrialDefaultsBeforeTrial(reset: AutomationStudioSiteResetTrialReset, signal: AbortSignal | undefined, supplied: unknown, options: AutomationStudioSiteResetBeforeTrialOptions): Promise<AutomationStudioSiteResetDecision> {
  const known = memory.get(reset) ?? { listed: new Set<string>(), closed: new Set<string>() };
  memory.set(reset, known);
  const cannotUndo = Array.isArray(supplied)
    ? supplied.filter((id): id is string => typeof id === "string" && known.listed.has(id))
    : known.closed.size ? [...known.closed] : undefined;
  const decision = await reset.beforeTrial(signal, cannotUndo, options);
  if (decision.kind === "refuse") {
    note(known, decision.evidence.actsToUndo);
    note(known, decision.evidence.actsUnsettleable);
  } else if (decision.startedWith) {
    note(known, decision.startedWith.acts);
    note(known, decision.startedWith.cannotUndo);
  }
  return decision;
}

/** Adds the `act` id of each entry of `acts` to `listed`, and to `closed` where it was listed as one no call can settle. */
function note(known: { listed: Set<string>; closed: Set<string> }, acts: unknown): void {
  if (!Array.isArray(acts)) return;
  for (const act of acts as unknown[]) {
    if (!act || typeof act !== "object" || Array.isArray(act)) continue;
    const { act: id, reason } = act as JsonObject;
    if (typeof id !== "string") continue;
    known.listed.add(id);
    if (reason === "gate_unsatisfiable") known.closed.add(id);
  }
}
