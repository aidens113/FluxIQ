import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { asRecord, textOf } from "../../home/model";
import { shapeRunRow, type RunRow } from "../model";

/** Every readable project's runs, named by Flow. `incomplete` is true when the Flow names could not be read, so some runs carry a general name. */
export type RunRows = { rows: RunRow[]; incomplete: boolean };

/**
 * The runs of every project the person may read, newest first within each project, in two requests however many projects
 * there are (`list-recent-flow-runs` and `list-workspace-flow-summaries`, asked together). Core decides which projects the
 * person may read, so no project list is read first and no project is asked one by one.
 * Throws when the runs could not be read.
 */
export async function loadRunRows(studio: ProgramCommandTransport, signal: AbortSignal): Promise<RunRows> {
  const [runsAnswer, flowsAnswer] = await Promise.all([
    studio.post<{ runs?: unknown }>("list-recent-flow-runs", {}, { signal }),
    studio.post<{ flows?: unknown }>("list-workspace-flow-summaries", {}, { signal })
  ]);
  if (!runsAnswer.ok) throw new Error("list-recent-flow-runs failed");
  const names = new Map<string, string>();
  const flows = flowsAnswer.ok && Array.isArray(flowsAnswer.payload?.flows) ? flowsAnswer.payload.flows : [];
  for (const flow of flows) {
    const record = asRecord(flow);
    const flowId = textOf(record?.flowId);
    const name = textOf(record?.name);
    if (flowId && name) names.set(flowId, name);
  }
  const runs = Array.isArray(runsAnswer.payload?.runs) ? runsAnswer.payload.runs : [];
  const rows = runs.flatMap((raw) => {
    const row = shapeRunRow(raw, names);
    return row ? [row] : [];
  });
  return { rows, incomplete: !flowsAnswer.ok };
}
