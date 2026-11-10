import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { asRecord, textOf } from "../../home/model";
import { flowSummaries } from "../wire";

/**
 * The project a Flow belongs to, for a link that names only the Flow (Home's, the assistant's).
 * Projects are searched in the order the engine lists them. Undefined when no readable project
 * holds it; throws when the projects cannot be listed.
 */
export async function findFlowProject(studio: ProgramCommandTransport, flowId: string, signal: AbortSignal): Promise<string | undefined> {
  const listed = await studio.get<{ projects?: unknown }>("projects", { signal });
  const projects = listed.ok ? asRecord(listed.payload)?.projects : undefined;
  if (!Array.isArray(projects)) throw new Error(listed.error ?? "The projects could not be listed.");
  for (const project of projects) {
    const projectId = textOf(asRecord(project)?.id);
    if (!projectId) continue;
    const flows = await studio.post("list-flow-summaries", { projectId }, { signal });
    if (flows.ok && flowSummaries(flows.payload)?.some((flow) => flow.flowId === flowId)) return projectId;
  }
  return undefined;
}
