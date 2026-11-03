// The project a request is about: the one it names, else the chat's own.

import type { ChatFailure } from "./chat-failure";
import type { ProgramChatTransportOptions } from "./options";

export type ProjectChoice = { ok: true; projectId: string } | { ok: false; failure: ChatFailure };

const NO_PROJECT = "FluxIQ has not said which project this chat belongs to yet. Choose a project, then try again.";

export function projectFor(named: string | undefined, options: Pick<ProgramChatTransportOptions, "projectId">): ProjectChoice {
  const projectId = named?.trim() || options.projectId()?.trim();
  if (projectId) return { ok: true, projectId };
  return { ok: false, failure: { ok: false, code: "no_project", sentence: NO_PROJECT } };
}
