import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { asRecord, textOf } from "../../home/model";
import { shapeRunRow, type RunRow } from "../model";

/** Every project's runs, named by Flow. `incomplete` is true when a project could not be read. */
export type RunRows = { rows: RunRow[]; incomplete: boolean };

/** The API's largest page, per project, newest first. A longer history needs paging in the list, not a bigger read. */
const RUNS_PER_PROJECT = 200;

async function readProject(studio: ProgramCommandTransport, projectId: string, signal: AbortSignal): Promise<RunRow[] | undefined> {
  const [runsAnswer, flowsAnswer] = await Promise.all([
    studio.post<{ runs?: unknown }>("list-flow-runs", { projectId, limit: RUNS_PER_PROJECT, sort: "started", direction: "desc" }, { signal }),
    studio.post<{ flows?: unknown }>("list-flow-summaries", { projectId }, { signal })
  ]);
  if (!runsAnswer.ok) return undefined;
  const names = new Map<string, string>();
  const flows = flowsAnswer.ok && Array.isArray(flowsAnswer.payload?.flows) ? flowsAnswer.payload.flows : [];
  for (const flow of flows) {
    const record = asRecord(flow);
    const flowId = textOf(record?.flowId);
    const name = textOf(record?.name);
    if (flowId && name) names.set(flowId, name);
  }
  const runs = Array.isArray(runsAnswer.payload?.runs) ? runsAnswer.payload.runs : [];
  return runs.flatMap((raw) => {
    const row = shapeRunRow(raw, names);
    return row ? [row] : [];
  });
}

/** Throws when the projects cannot be listed, or when none of them could be read. */
export async function loadRunRows(studio: ProgramCommandTransport, signal: AbortSignal): Promise<RunRows> {
  const projectsAnswer = await studio.get<{ projects?: unknown }>("projects", { signal });
  if (!projectsAnswer.ok) throw new Error("projects failed");
  const projectIds = (Array.isArray(projectsAnswer.payload?.projects) ? projectsAnswer.payload.projects : []).flatMap((project) => {
    const id = textOf(asRecord(project)?.id);
    return id ? [id] : [];
  });
  const loaded = await Promise.all(projectIds.map((projectId) => readProject(studio, projectId, signal)));
  const read = loaded.flatMap((rows) => (rows ? [rows] : []));
  if (projectIds.length > 0 && read.length === 0) throw new Error("no project could be read");
  return { rows: read.flat(), incomplete: read.length < projectIds.length };
}
