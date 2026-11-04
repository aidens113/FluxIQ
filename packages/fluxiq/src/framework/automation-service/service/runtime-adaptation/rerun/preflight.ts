// Whether a re-run from the Flow's start would be declined for a lasting act, asked
// before a repair pays for anything whose only use is that re-run.
//
// A re-authored Flow, and a patch on a refuted run, reach a judged run only by
// running from the start (`../repair-rerun.ts`), and that re-run is declined where a
// stated lasting act may have landed. The build used to be paid for first. This is
// the same check on the same reads, so the answer cannot differ from the re-run's;
// the re-run keeps its own, for a caller that did not ask.

import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import { AUTOMATION_STUDIO_REPAIR_RERUN_DECLINED, automationStudioRepairChangedFlow, type AutomationStudioRepairFlowReads } from "./flow.ts";
import { automationStudioRunMayHaveActedLastingly } from "./lasting-acts.ts";

/**
 * What the check came to. `unread` is not `clear`: nothing is known about the run,
 * and it stops nothing, because a read that failed once is no reason to give up a
 * repair, and the re-run answers for it if it fails again.
 */
export type AutomationStudioRerunPreflight = { declined: string } | { clear: true } | { unread: "session" | "graph" };

export async function automationStudioRerunPreflight(input: {
  ports: AutomationStudioRepairFlowReads & { getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> };
  projectId: string;
  detail: AutomationStudioFlowRunDetail;
  graphOptions?: AutomationStudioGraphExecutionOptions | undefined;
  subflowId?: string | undefined;
}): Promise<AutomationStudioRerunPreflight> {
  let session: AutomationStudioRuntimeSession | null;
  try {
    session = await input.ports.getRuntimeSession(input.projectId, input.detail.summary.runId);
  } catch {
    return { unread: "session" };
  }
  if (!session) return { unread: "session" };
  const found = await automationStudioRepairChangedFlow({ ports: input.ports, projectId: input.projectId, session, subflowId: input.subflowId });
  if ("declinedCode" in found) return { unread: "graph" };
  return await automationStudioRunMayHaveActedLastingly({ flow: found.flow, session, detail: input.detail, graphOptions: input.graphOptions })
    ? { declined: AUTOMATION_STUDIO_REPAIR_RERUN_DECLINED.lastingAct }
    : { clear: true };
}
