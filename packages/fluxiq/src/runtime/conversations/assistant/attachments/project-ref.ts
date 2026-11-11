// The project a panel turn's attachment refers into, kept in its reference.
//
// A panel thread belongs to no project, so a turn that shows a project's own
// record (a proposed change to a Flow) names that project in the reference it
// stores, when the turn is written: `{"projectId":"<project>","ref":"<ref>"}`,
// where `ref` is the reference the project's own resolver reads. A reader then
// reads it in that project, whatever project is open when it does.
//
// A reference written before the project was kept is the resolver's reference
// alone; it names no project and is read as it always was, in the project the
// request names (`./payload.ts`). Such a reference never begins with `{`: the
// project-bound kinds' references are ids (`flowId:adaptationId`, a capability
// id).

import { automationStudioConversationIdOrRefuse } from "../../inputs.ts";
import type { AutomationStudioConversationAttachment } from "../../turn.ts";
import { PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, type PanelAssistantTurnAttachment } from "../loop/index.ts";

/** The project id a panel thread reads back with; it names no project. */
const PANEL_PROJECT = "panel";

/**
 * Panel turns' attachment references as stored, and the project each names.
 *
 * - `stored`: the attachment a turn stores. A navigation is stored as it is; any
 *   other kind refers to a project's record and must name its project, which
 *   goes into the stored reference.
 * - `projectOf`: the project a stored reference names and the attachment the
 *   project's resolver reads, or null for a reference that names none.
 */
export const panelAssistantAttachmentProjects = Object.freeze({
  stored(attachment: PanelAssistantTurnAttachment): AutomationStudioConversationAttachment {
    if (attachment.kind === PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT) return { kind: attachment.kind, ref: attachment.ref };
    const projectId = projectIdOf(attachment.projectId);
    if (projectId === null) throw new Error(`A panel turn's attachment of kind ${attachment.kind} names the project it refers into.`);
    return { kind: attachment.kind, ref: JSON.stringify({ projectId, ref: attachment.ref }) };
  },

  projectOf(attachment: AutomationStudioConversationAttachment): { projectId: string; attachment: AutomationStudioConversationAttachment } | null {
    if (!attachment.ref.startsWith("{")) return null;
    const unreadable = `This deployment cannot serve a conversation attachment of kind ${attachment.kind}.`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(attachment.ref);
    } catch (error) {
      throw new Error(unreadable, { cause: error });
    }
    const fields = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { projectId?: unknown; ref?: unknown }) : {};
    const projectId = projectIdOf(fields.projectId);
    if (projectId === null || typeof fields.ref !== "string" || !fields.ref.trim()) throw new Error(unreadable);
    return { projectId, attachment: { kind: attachment.kind, ref: fields.ref } };
  }
});

/** A project id, or null when the value names none (absent, empty, or the panel thread's own `panel`). A malformed id is refused. */
function projectIdOf(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.trim() === PANEL_PROJECT) return null;
  return automationStudioConversationIdOrRefuse(value, "project");
}
