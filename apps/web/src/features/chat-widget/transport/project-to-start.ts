// The project a new chat starts in: the one the request names, else the chat's own, else (when the host
// gives one) the person's project, which Core finds or makes. Only starting a chat (a first message, New
// chat) reaches the person's project; reading or stopping in no project stays "no project".

import type { ProgramChatTransportOptions } from "./options";
import { projectFor, type ProjectChoice } from "./project-for";

export type ProjectToStart = Extract<ProjectChoice, { ok: false }> | { ok: true; projectId: string; found: boolean };

export async function projectToStart(named: string | undefined, options: Pick<ProgramChatTransportOptions, "projectId" | "personProject">): Promise<ProjectToStart> {
  const project = projectFor(named, options);
  if (project.ok) return { ok: true, projectId: project.projectId, found: false };
  if (!options.personProject) return project;
  const found = await options.personProject.find();
  if (!found.ok) return { ok: false, failure: found };
  return { ok: true, projectId: found.value, found: true };
}
