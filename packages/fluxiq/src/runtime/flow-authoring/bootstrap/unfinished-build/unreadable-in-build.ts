// The unreadable replies a budget ending tells of, counted over the whole build (t1056).
//
// The loop reports the streak its budget ran out during and every unreadable reply of that one round
// (`../../../llm/evidence-loop/result.ts`, `unreadable`). Since no count of rounds ends a build, a build whose replies
// never became readable runs round after round, each ended by loop detection, and its ending said "In all, 4 of 118
// replies could not be read" when all 118 were: the last round's total beside the build's decisions. The build's own
// record holds every round's rows, each unreadable reply among them as an `unusable` row under its code, so the total
// is counted there.
//
// The predicate comes from the models' failures module itself, never `../../../llm/index.ts`, whose barrel reaches
// back into `flow-authoring/` (`./round-funding.ts` says what that cycle did).
import { automationStudioLlmReplyUnreadable, type AutomationStudioLlmEvidenceLoopUnreadable } from "../../../models/failures/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "../../../llm/index.ts";

/** `unreadable` with its total the build's: every unreadable reply in `record`, every round's rows (header). */
export function automationStudioFlowBootstrapUnreadableInBuild(unreadable: AutomationStudioLlmEvidenceLoopUnreadable, record: readonly AutomationStudioLlmEvidenceLoopTrace[]): AutomationStudioLlmEvidenceLoopUnreadable {
  const inBuild = record.filter((row) => row.decision === "unusable" && row.resultCode !== undefined && automationStudioLlmReplyUnreadable([row.resultCode])).length;
  return { ...unreadable, total: Math.max(unreadable.total, inBuild) };
}
