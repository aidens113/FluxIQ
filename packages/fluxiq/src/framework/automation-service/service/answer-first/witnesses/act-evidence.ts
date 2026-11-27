// The trail entries each of an attempt's own acts landed with, for a later attempt that carries those acts (t1075 D).
//
// **Why.** An act an earlier attempt made is carried as already done, so a later attempt's run passes its step over and
// its judge sees the act's words ("Already done earlier: ...") and nothing of how it was chosen. In
// `run-mwynbry2-f3c88dc7` attempt 3's replay passed "+ Add" over as done, and its judge said unsure (0101): the request
// asked for an item rated 4.5 stars or more, and nothing in the trail it was shown held the read the press was chosen
// from. So each act keeps the part of its own attempt's trail it landed with, and the judge of an attempt that carries
// it is shown that part (`./carried-trail.ts`).
//
// **Which entries.** Those after the entry that landed the attempt's previous act, up to and including the entry that
// landed this one: what the attempt did on the site to come to this act (its looks, reads and choices), and the act
// itself with what the site answered. An entry is known to have landed an act by the act record's settlement stamped on
// it (`judgeAct`), or else by its call's id where the record says which act that call made (`record.calls.actOf`). An act
// no entry is known to have landed (a saved Flow's step, whose entries name no call) has none: its words still say it.
//
// What an entry names of its own attempt's result (`judgeSource`, `judgeSources`) and settlement (`judgeAct`) is left
// off the copy: another attempt's judge reads the result it judges by those, and this is not that result. So is its
// call's id: a model names its calls itself, the later attempt's own calls may use the same ids, and a judge reads a
// repeated value by the id of the entry it first appeared in (`runtime/result-verification/run-trail/repeats.ts`).

import type { AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";

/** For each of `own` (this attempt's own act ids) an entry of `trail` landed, the entries it landed with (header). */
export function automationStudioAnswerFirstActEvidence(input: {
  trail: readonly AutomationStudioResultTrailStep[];
  /** The act a call of this attempt made, where one call made one act (`record.calls.actOf`). */
  actOfCall(callId: string): string | undefined;
  own: ReadonlySet<string>;
}): Map<string, AutomationStudioResultTrailStep[]> {
  const landedAt = new Map<string, number>();
  for (const [index, step] of input.trail.entries()) {
    const act = step.judgeAct?.actId ?? (step.callId === undefined ? undefined : input.actOfCall(step.callId));
    if (act !== undefined && input.own.has(act)) landedAt.set(act, index);
  }
  const evidence = new Map<string, AutomationStudioResultTrailStep[]>();
  let after = 0;
  for (const [act, index] of [...landedAt].sort((one, other) => one[1] - other[1])) {
    evidence.set(act, input.trail.slice(after, index + 1).map(copied));
    after = index + 1;
  }
  return evidence;
}

/** An entry as another attempt's judge is shown it: without its call's id and what names its own attempt's result and settlement (header). */
function copied(step: AutomationStudioResultTrailStep): AutomationStudioResultTrailStep {
  const { callId: _call, judgeSource: _source, judgeSources: _sources, judgeAct: _act, ...kept } = structuredClone(step);
  return kept;
}
