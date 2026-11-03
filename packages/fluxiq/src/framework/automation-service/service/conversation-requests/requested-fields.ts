// A conversation request's closed fields, read from what the caller sent: a
// field that is half there or not one Core knows is refused rather than ignored.

import {
  AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS,
  isAutomationStudioConversationStatus,
  isAutomationStudioConversationSubjectKind,
  type AutomationStudioConversationAnswerKind,
  type AutomationStudioConversationStatus,
  type AutomationStudioConversationSubject
} from "../../../../runtime/conversations/index.ts";

/** A subject is a kind and an id together; half of one narrows nothing and is refused rather than ignored. */
export function requestedSubject(kind: unknown, id: unknown): AutomationStudioConversationSubject | undefined {
  if (kind === undefined && id === undefined) return undefined;
  if (!isAutomationStudioConversationSubjectKind(kind)) throw new Error("A conversation subject kind must be project, flow, build or run.");
  if (typeof id !== "string" || !id) throw new Error("A conversation subject needs an ID.");
  return { kind, id };
}

export function requestedStatus(status: unknown): AutomationStudioConversationStatus | undefined {
  if (status === undefined) return undefined;
  if (!isAutomationStudioConversationStatus(status)) throw new Error("A conversation status is open or resolved.");
  return status;
}

export function requestedAttachment(kind: unknown, ref: unknown): { kind: string; ref: string } | undefined {
  if (kind === undefined && ref === undefined) return undefined;
  if (typeof kind !== "string" || !kind || typeof ref !== "string" || !ref) throw new Error("A conversation attachment needs both a kind and a reference.");
  return { kind, ref };
}

export function requiredAnswerKind(kind: unknown): AutomationStudioConversationAnswerKind {
  if (typeof kind !== "string" || !(AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`An answer is one of: ${AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS.join(", ")}.`);
  }
  return kind as AutomationStudioConversationAnswerKind;
}
