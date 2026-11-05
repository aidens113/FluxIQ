import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../api-contracts/automation.ts";

type NamedProject = { id: string; name?: unknown };

/**
 * What a project is called, for the person's own client to say in words rather than by id. Read through the registry as
 * the person, so a project they may not see has no name here. None when the project is not in the list or has no name.
 */
export async function automationStudioProjectName(input: { registry: GlobalProgramApiRegistry; actor: ProgramApiActor; domainId: string | null; projectId: string }): Promise<string | null> {
  if (input.domainId === null) return null;
  const listed = await input.registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.projects, scope: { domainId: input.domainId }, actor: input.actor, payload: {} });
  const projects = listed.ok ? (listed.payload as { projects?: NamedProject[] } | undefined)?.projects ?? [] : [];
  const name = projects.find((project) => project.id === input.projectId)?.name;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
}
