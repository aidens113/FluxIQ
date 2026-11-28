// The project a request is about: the one it names, else the chat's own.

import type { ChatFailure } from "./chat-failure";
import type { ProgramChatTransportOptions } from "./options";

export type ProjectChoice = { ok: true; projectId: string } | { ok: false; failure: ChatFailure };

// Every chat belongs to a project, and nobody has to make one first: a first message puts the chat in
// the person's project (`project-to-start.ts`). So this names that, never "choose a project".
const NO_PROJECT = "This chat is not in a project yet. Send a message and FluxIQ puts it in your project.";

export function projectFor(named: string | undefined, options: Pick<ProgramChatTransportOptions, "projectId">): ProjectChoice {
  const projectId = named?.trim() || options.projectId()?.trim();
  if (projectId) return { ok: true, projectId };
  return { ok: false, failure: { ok: false, code: "no_project", sentence: NO_PROJECT } };
}
