// What this build's amendment decisions already did, so the loop can tell the
// model when one is the same refused edit again, or an edit that undoes another.
//
// **Why.** The commonest decision that changed nothing on the hard live builds
// of 2026-09-28 was an amendment the model had already been refused for,
// sent again word for word: everything-store round 2 sent one set of five
// refused amendments four decisions running (#16-#19), and bigbox round 2
// "kept" one step three times (#8, #10, #12). Each time the model was told the
// reason afresh, in the same words, as if it were news. And crossborder round
// 1 dropped, kept and dropped one step (#12-#15): every one of those "applied",
// so the no-progress guard -- which counts an edit that changed nothing, and
// only that -- never saw a loop that was going nowhere.
//
// So two things are remembered, both Core's own bookkeeping and never a value
// from a page:
//
//   1. every refusal given, by the step it named, the node that step ran and
//      the reason, so a refusal given again is marked `repeated`;
//   2. every draft the build has stood at, by the Flow it describes -- each
//      step's name, whether it is in, how it runs, what it carries -- so an
//      applied edit that puts the draft back exactly as it stood is known as
//      one that changed nothing about the Flow.
//
// A tool call appends a step, so a draft after one is always new: only a run of
// amendments with nothing run between them can come back to a draft it left.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

export type AutomationStudioLlmEvidenceAmendmentMemory = {
  /** The refusals, each marked `repeated` when this build already gave it. Records them. */
  refusals<Refusal extends { step: number; reason: string; nodeId?: string }>(refused: readonly Refusal[]): (Refusal & { repeated?: true })[];
  /** Records the draft as it stands before a decision's amendments are applied. */
  before(iteration: number, steps: readonly AutomationStudioFlowDraftStep[]): void;
  /** The iteration the draft first stood exactly like this at, when it did; otherwise records it and answers nothing. */
  after(iteration: number, steps: readonly AutomationStudioFlowDraftStep[]): number | undefined;
};

export function automationStudioLlmEvidenceAmendmentMemory(): AutomationStudioLlmEvidenceAmendmentMemory {
  const given = new Set<string>();
  const drafts = new Map<string, number>();
  const record = (iteration: number, steps: readonly AutomationStudioFlowDraftStep[]): number | undefined => {
    const signature = draftSignature(steps);
    const seen = drafts.get(signature);
    if (seen === undefined) drafts.set(signature, iteration);
    return seen;
  };
  return {
    refusals(refused) {
      return refused.map((refusal) => {
        const key = `${refusal.step}:${refusal.reason}:${refusal.nodeId ?? ""}`;
        const repeated = given.has(key);
        given.add(key);
        return repeated ? { ...refusal, repeated: true as const } : { ...refusal };
      });
    },
    before(iteration, steps) {
      record(iteration, steps);
    },
    after(iteration, steps) {
      return record(iteration, steps);
    }
  };
}

/**
 * The Flow a draft describes, and nothing about how it came to: what an
 * amendment can change. That includes the acts a step does and what it runs
 * with (`ranWith`, where a `bind` writes): live run `run-musp4h2f-72e8ed99`
 * moved act a3 to another step at decision 0086 and was told the edit undid
 * itself, because the signature left acts out, and a `bind` (t252) would have
 * been told the same.
 */
function draftSignature(steps: readonly AutomationStudioFlowDraftStep[]): string {
  return JSON.stringify(steps.map((step): JsonObject => ({
    id: step.id ?? `p${step.position}`,
    disposition: step.disposition,
    ...(step.routing ? { routing: step.routing as unknown as JsonObject } : {}),
    ...(step.settings ? { settings: step.settings } : {}),
    ...(step.acts?.length ? { acts: [...step.acts].sort() } : {}),
    ...(step.ranWith ? { ranWith: step.ranWith } : {})
  })));
}
