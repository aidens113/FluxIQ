// The one permission question a task asks when it starts (t976, F21).
//
// **The user's rule (2026-11-03, 2026-11-10).** "NO PIN FOR ANY NORMAL ACTIONS. Maybe just a pin to
// do dangerous actions ONLY THE FIRST TIME A USER DOES IT, AND NEVER IN THE MIDDLE OF A FLOW, ONLY
// WHEN FIRST STARTING A FLOW/CHAT." The lead's MVP decision: no PIN at all; a dangerous act (moving
// money, deleting, sending or posting) asks one plain permission question when a Flow or chat
// starts, never mid-Flow and never again in the same chat.
//
// Live run `run-mwounh32-24f9bc6b` (social-network-feed, delete-stranger-requests) asked at its
// first Delete press, 85 decisions into the build, and the next attempt in the same chat asked
// again before its saved Flow ran: the question was raised by the press, per build.
//
// So the classes a task needs are taken from the person's instruction before anything acts, and
// asked about in one question that names the task rather than a control. It is an ordinary
// permission request in every other way: the same schema, the same ask, the same answers. Its
// action is Core's own (`core.task_start`), which is how a client or the Lab tells it from a press.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "./consequences.ts";
import type { AutomationStudioActionPermissionRequest } from "./request.ts";

/** The action a task-start question is about: the task itself, each time it runs from this chat. */
export const AUTOMATION_STUDIO_ACTION_PERMISSION_TASK_START = Object.freeze({ kind: "flow_step" as const, id: "core.task_start", ref: "task.start", verb: "do" });

/** Core's sentence for a task-start question: what the task needs, and how long the answer holds. */
export function automationStudioActionPermissionTaskStartSentence(missing: readonly AutomationStudioActionConsequence[]): string {
  const said = automationStudioConsequencesInOrder([...missing]).map((consequence) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]);
  const list = said.length <= 1 ? said.join("") : `${said.slice(0, -1).join(", ")} and ${said.at(-1)}`;
  return `To do this task, FluxIQ needs to ${list}. Your answer holds for this whole chat, including when the task runs again.`;
}

/** Whether a request is a task-start question rather than one press's. */
export function isAutomationStudioActionPermissionTaskStart(request: Pick<AutomationStudioActionPermissionRequest, "action"> | undefined): boolean {
  return request?.action.id === AUTOMATION_STUDIO_ACTION_PERMISSION_TASK_START.id && request.action.ref === AUTOMATION_STUDIO_ACTION_PERMISSION_TASK_START.ref;
}
