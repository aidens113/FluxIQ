// Whether a run may have done something lasting, in any pass so far, so that
// running its Flow again from the start would do it a second time
// (`runtime/adaptation/flow-change/lasting-acts.ts` says what counts).
//
// **Each pass is read against the graph it ran, and only then.** The stored Flow
// is the first pass's graph, because a patch or a held re-author runs unapplied. A
// later pass ran another graph, which a later read may not be able to hand back: a
// held edit a later attempt replaced is rejected. Read against the stored Flow, that
// pass's domain steps have no node, so they count, and a repair's second attempt was
// declined after its build, every time, on steps that stated nothing; its `builtin.`
// steps have no node either, so they did not count whatever they stated. So a pass
// says what it did as it ends, on the session, and later reads take its word.
//
// A trial's attempts are on no pass's trace, so its receipt says it instead
// (`actedLastingly`, `recovery/annotation/patches.ts`).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioAttemptsMayHaveActedLastingly } from "../../../../../runtime/adaptation/flow-change/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { isJsonRecord } from "../../json-values.ts";

/** Where a re-run pass leaves its word on the session's metadata. */
const PASSES_KEY = "repairRerunPasses";

type EffectReads = Pick<AutomationStudioGraphExecutionOptions, "resolveActionEffect" | "subflowGraphs">;

/**
 * Whether the run may have acted lastingly in a pass or a trial. `flow` is the
 * graph the first pass ran.
 */
export async function automationStudioRunMayHaveActedLastingly(input: {
  flow: Pick<AutomationStudioFlowDocument, "nodes">;
  session: Pick<AutomationStudioRuntimeSession, "trace" | "metadata">;
  detail: Pick<AutomationStudioFlowRunDetail, "metadata">;
  graphOptions?: EffectReads | undefined;
}): Promise<boolean> {
  const receipts = Array.isArray(input.detail.metadata?.runtimePatchAttempts) ? input.detail.metadata.runtimePatchAttempts : [];
  if (receipts.some((receipt) => isJsonRecord(receipt) && receipt.actedLastingly === true)) return true;
  const passes = passesOf(input.session.metadata);
  if (passes?.lasting === true) return true;
  const attempts = input.session.trace?.attempts ?? [];
  return await automationStudioAttemptsMayHaveActedLastingly({
    flow: input.flow,
    attempts: passes ? attempts.slice(0, passes.firstPassAttempts) : attempts,
    resolveActionEffect: input.graphOptions?.resolveActionEffect,
    subflowGraphs: input.graphOptions?.subflowGraphs
  });
}

/**
 * The session's metadata with this re-run pass's word on it. `flow` is the graph
 * this pass ran. A pass whose steps cannot be read counts: not knowing is not a no.
 */
export async function automationStudioMetadataWithRerunPass(input: {
  metadata: JsonObject;
  flow: Pick<AutomationStudioFlowDocument, "nodes">;
  attemptsBefore: number;
  pass: readonly AutomationStudioNodeAttemptTrace[];
  graphOptions?: EffectReads | undefined;
}): Promise<JsonObject> {
  const earlier = passesOf(input.metadata);
  let lasting = earlier?.lasting === true;
  if (!lasting) {
    try {
      lasting = await automationStudioAttemptsMayHaveActedLastingly({ flow: input.flow, attempts: input.pass, resolveActionEffect: input.graphOptions?.resolveActionEffect, subflowGraphs: input.graphOptions?.subflowGraphs });
    } catch {
      lasting = true;
    }
  }
  return { ...input.metadata, [PASSES_KEY]: { firstPassAttempts: earlier?.firstPassAttempts ?? input.attemptsBefore, lasting } };
}

function passesOf(metadata: JsonObject | undefined): { firstPassAttempts: number; lasting: boolean } | undefined {
  const passes = metadata?.[PASSES_KEY];
  if (!isJsonRecord(passes) || !Number.isSafeInteger(passes.firstPassAttempts) || (passes.firstPassAttempts as number) < 0) return undefined;
  return { firstPassAttempts: passes.firstPassAttempts as number, lasting: passes.lasting === true };
}
