// What a panel turn's attachment refers to.
//
// A panel thread belongs to no project, so its attachments are of two sorts:
//
// - `panel.client-action`, a navigation the assistant asked the dock to run,
//   carries the whole action in its reference, which is answered parsed;
// - anything that refers to a project's own record, such as a proposed change
//   to a Flow (`flow-graph-diff`), is read in a project by `inProject`, which
//   the program side decides by IAM and the domain scope as a call naming that
//   project would be. The project is the one the turn's reference names
//   (`./project-ref.ts`), whatever project the request names; a reference
//   written before turns kept their project names none, and is read in the
//   project the request names, and refused when it names none.
//
// Every refusal is thrown, never answered as an empty payload, so a reader can
// tell "shows nothing" from "shows something that could not be fetched", as
// `get-conversation-attachment` does (`../../conversations.ts`).

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioConversationAttachment } from "../../turn.ts";
import { PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT } from "../loop/index.ts";
import { panelAssistantAttachmentProjects } from "./project-ref.ts";

/** A project-bound attachment of a panel turn, to be read in `projectId`. */
export type PanelAssistantProjectAttachmentRead = { projectId: string; conversationId: string; turnId: string; attachment: AutomationStudioConversationAttachment };

/** Reads a project-bound attachment in `read.projectId`, once that project is allowed. */
export type PanelAssistantProjectAttachments = (read: PanelAssistantProjectAttachmentRead) => Promise<unknown>;

/** The payload of one panel turn's attachment. `read.projectId` is the request's project, used only when the reference names none. */
export async function panelAssistantAttachmentPayload(
  read: Omit<PanelAssistantProjectAttachmentRead, "projectId"> & { projectId: string | null },
  inProject: PanelAssistantProjectAttachments
): Promise<unknown> {
  const { attachment } = read;
  if (attachment.kind === PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT) return clientAction(attachment.ref);
  const own = panelAssistantAttachmentProjects.projectOf(attachment);
  if (own) return inProject({ ...read, projectId: own.projectId, attachment: own.attachment });
  if (read.projectId === null) throw new Error(`A conversation attachment of kind ${attachment.kind} is read in its project: name the project.`);
  return inProject({ ...read, projectId: read.projectId });
}

/** The navigation a client-action reference holds (`../loop/call-step.ts` writes it as JSON). */
function clientAction(ref: string): { tool: string; input: JsonObject } {
  const unreadable = `This deployment cannot serve a conversation attachment of kind ${PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT}.`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(ref);
  } catch (error) {
    throw new Error(unreadable, { cause: error });
  }
  const action = isObject(parsed) ? (parsed as { tool?: unknown; input?: unknown }) : {};
  if (typeof action.tool !== "string" || !isObject(action.input)) throw new Error(unreadable);
  return { tool: action.tool, input: action.input as JsonObject };
}

function isObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
