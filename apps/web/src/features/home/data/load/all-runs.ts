import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { asRecord, shapeRun, textOf } from "../../model";
import type { HomeRuns } from "./runs";

/**
 * The runs of every project the person may see, and the Flow names to show them under: two requests however many
 * projects there are (`list-recent-flow-runs` and `list-workspace-flow-summaries`), asked together. Core decides
 * which projects the person may read, so the panel needs no project list first.
 * Throws when the runs could not be read; the Flow names failing only leaves runs under a general name, marked `incomplete`.
 */
export async function loadAllRuns(studio: ProgramCommandTransport, signal: AbortSignal): Promise<HomeRuns> {
  const [runsAnswer, flowsAnswer] = await Promise.all([
    studio.post<{ runs?: unknown }>("list-recent-flow-runs", {}, { signal }),
    studio.post<{ flows?: unknown }>("list-workspace-flow-summaries", {}, { signal })
  ]);
  if (!runsAnswer.ok) throw new Error("list-recent-flow-runs failed");
  const flowNames = new Map<string, string>();
  const flows = flowsAnswer.ok && Array.isArray(flowsAnswer.payload?.flows) ? flowsAnswer.payload.flows : [];
  for (const flow of flows) {
    const row = asRecord(flow);
    const flowId = textOf(row?.flowId);
    const name = textOf(row?.name);
    if (flowId && name) flowNames.set(flowId, name);
  }
  const raw = Array.isArray(runsAnswer.payload?.runs) ? runsAnswer.payload.runs : [];
  const runs = raw.flatMap((entry) => {
    const run = shapeRun(entry, flowNames);
    return run ? [run] : [];
  });
  return { runs, flowNames, incomplete: !flowsAnswer.ok };
}
