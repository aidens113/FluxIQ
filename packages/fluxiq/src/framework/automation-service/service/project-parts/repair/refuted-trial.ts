// A newer version was tried in a run, and the run was judged not to answer. That is said of
// that version alone, so the next run does not try it again. It is said on the record a part's
// own run writes, because a version saved from a graph with no revision has no verdict rows.
// Only a real verdict is said: a judge that could not be reached, gave none, or could not tell
// moves nothing, though the promotion reads such a check as not answering.
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PART_NEWER_TRIAL_KEY, automationStudioPartPinOf } from "../../../../../engine/automation/frames/index.ts";
import type { AutomationStudioFlowAdaptation } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioRecordedVerdictIsNo } from "../../../../../runtime/result-verification/run-record.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../../persistence/automation/index.ts";
import { withProjectPartStores } from "../stores.ts";

/** Says it, when this adaptation was a newer version's trial and `resultVerification` (as the run recorded it) is a real no. A write that fails changes nothing about the run. */
export async function projectPartRecordRefutedTrial(pool: AutomationStudioProjectDatabasePool | undefined, adaptation: Pick<AutomationStudioFlowAdaptation, "projectId" | "metadata">, runId: string, resultVerification: unknown): Promise<void> {
  if (!automationStudioRecordedVerdictIsNo(resultVerification)) return;
  const pin = automationStudioPartPinOf((adaptation.metadata as JsonObject | undefined)?.[AUTOMATION_STUDIO_PART_NEWER_TRIAL_KEY]);
  if (!pin) return;
  await withProjectPartStores(pool, adaptation.projectId, (stores) => stores.parts.recordRun({ partId: pin.partId, version: pin.version, runId, outcome: "failed", modelCalls: 0, finishedAtMs: Date.now() })).catch(/* best-effort: the run has already ended on its verdict */ () => undefined);
}
