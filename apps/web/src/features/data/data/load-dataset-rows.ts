import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { asRecord, textOf } from "../../home/model";
import { shapeDatasetRow, type DatasetRow } from "../model";

/** Every project's tables, named by Flow. `incomplete` is true when a project could not be read. */
export type DatasetRows = { rows: DatasetRow[]; incomplete: boolean };

type TablesAnswer = { datasets?: unknown; page?: { nextCursor?: unknown } };

/** The API's largest page, per read. */
const TABLES_PER_PAGE = 200;

/** Every table of one project, following the cursor until it ends or repeats. Undefined when a read fails. */
async function readTables(studio: ProgramCommandTransport, projectId: string, signal: AbortSignal): Promise<unknown[] | undefined> {
  const tables: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const answer = await studio.post<TablesAnswer>("list-project-datasets", { projectId, limit: TABLES_PER_PAGE, ...(cursor ? { cursor } : {}) }, { signal });
    if (!answer.ok) return undefined;
    if (Array.isArray(answer.payload?.datasets)) tables.push(...answer.payload.datasets);
    const next = textOf(answer.payload?.page?.nextCursor);
    if (!next || seen.has(next)) return tables;
    seen.add(next);
    cursor = next;
  }
}

async function readProject(studio: ProgramCommandTransport, projectId: string, signal: AbortSignal): Promise<DatasetRow[] | undefined> {
  const [tables, flowsAnswer] = await Promise.all([
    readTables(studio, projectId, signal),
    studio.post<{ flows?: unknown }>("list-flow-summaries", { projectId }, { signal })
  ]);
  if (!tables) return undefined;
  const names = new Map<string, string>();
  const flows = flowsAnswer.ok && Array.isArray(flowsAnswer.payload?.flows) ? flowsAnswer.payload.flows : [];
  for (const flow of flows) {
    const record = asRecord(flow);
    const flowId = textOf(record?.flowId);
    const name = textOf(record?.name);
    if (flowId && name) names.set(flowId, name);
  }
  return tables.flatMap((raw) => {
    const row = shapeDatasetRow(raw, projectId, names);
    return row ? [row] : [];
  });
}

/** Throws when the projects cannot be listed, or when none of them could be read. */
export async function loadDatasetRows(studio: ProgramCommandTransport, signal: AbortSignal): Promise<DatasetRows> {
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
