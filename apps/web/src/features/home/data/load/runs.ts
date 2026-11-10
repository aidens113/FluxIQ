import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { asRecord, shapeRun, textOf, type HomeRun } from "../../model";

/** The runs of every project, and the Flow names to show them under. `incomplete` is true when a project could not be read. */
export type HomeRuns = { runs: HomeRun[]; flowNames: Map<string, string>; incomplete: boolean };

/** The most runs read from one project: the API's largest page. Today's count and the recent list both come from the newest. */
const RUNS_PER_PROJECT = 200;

async function loadProject(studio: ProgramCommandTransport, projectId: string, signal: AbortSignal): Promise<{ runs: unknown[]; names: Map<string, string> } | undefined> {
  const [runsAnswer, flowsAnswer] = await Promise.all([
    studio.post<{ runs?: unknown }>("list-flow-runs", { projectId, limit: RUNS_PER_PROJECT, sort: "started", direction: "desc" }, { signal }),
    studio.post<{ flows?: unknown }>("list-flow-summaries", { projectId }, { signal })
  ]);
  if (!runsAnswer.ok) return undefined;
  const names = new Map<string, string>();
  const flows = flowsAnswer.ok && Array.isArray(flowsAnswer.payload?.flows) ? flowsAnswer.payload.flows : [];
  for (const flow of flows) {
    const row = asRecord(flow);
    const flowId = textOf(row?.flowId);
    const name = textOf(row?.name);
    if (flowId && name) names.set(flowId, name);
  }
  return { runs: Array.isArray(runsAnswer.payload?.runs) ? runsAnswer.payload.runs : [], names };
}

/** Throws when the projects cannot be listed, or when none of them could be read. */
export async function loadRuns(studio: ProgramCommandTransport, signal: AbortSignal): Promise<HomeRuns> {
  const projectsAnswer = await studio.get<{ projects?: unknown }>("projects", { signal });
  if (!projectsAnswer.ok) throw new Error("projects failed");
  const projectIds = (Array.isArray(projectsAnswer.payload?.projects) ? projectsAnswer.payload.projects : []).flatMap((project) => {
    const id = textOf(asRecord(project)?.id);
    return id ? [id] : [];
  });
  const loaded = await Promise.all(projectIds.map((projectId) => loadProject(studio, projectId, signal)));
  const read = loaded.flatMap((project) => (project ? [project] : []));
  if (projectIds.length > 0 && read.length === 0) throw new Error("no project could be read");
  const flowNames = new Map<string, string>();
  for (const project of read) for (const [flowId, name] of project.names) flowNames.set(flowId, name);
  const runs = read.flatMap((project) => project.runs.flatMap((raw) => {
    const run = shapeRun(raw, flowNames);
    return run ? [run] : [];
  }));
  return { runs, flowNames, incomplete: read.length < projectIds.length };
}
