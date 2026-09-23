// What the store will accept, and the checks that refuse anything else.
//
// These sit apart from the store so that the store reads as transactions and
// SQL, and so that the rule a write has to satisfy is in one place: a turn
// says something and is not longer than a turn may be, an attachment carries
// both a kind and a reference, a choice offers at least two options, and a
// permission ask is keyed by its request's own `requestId` -- the last being
// the one that would quietly break the join between a run that stopped and the
// person who answers.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../action-permissions/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_TEXT_MAX, type AutomationStudioConversationAttachment, type AutomationStudioConversationAuthor } from "./turn.ts";
import type { AutomationStudioConversationAnswerKind, AutomationStudioConversationAskInput } from "./ask.ts";
import type { AutomationStudioConversationStatus, AutomationStudioConversationSubjectKind } from "./thread.ts";

const ID = /^[A-Za-z0-9._:-]{1,200}$/u;
const MAX_ATTACHMENT_REF = 1_000;
const MAX_OPTIONS = 20;

/** The longest a thread's title may be. */
export const AUTOMATION_STUDIO_CONVERSATION_TITLE_MAX = 200;
/** The longest an answer's value may be: an option id, or the words an open question takes. */
export const AUTOMATION_STUDIO_CONVERSATION_ANSWER_VALUE_MAX = 4_000;

export type AutomationStudioConversationOpenInput = {
  mutationId: string;
  conversationId: string;
  subjectKind: AutomationStudioConversationSubjectKind;
  subjectId: string;
  title?: string | null;
  changedAt?: number;
};

export type AutomationStudioConversationTurnInput = {
  mutationId: string;
  conversationId: string;
  turnId: string;
  author: AutomationStudioConversationAuthor;
  text: string;
  actorId?: string | null;
  attachment?: AutomationStudioConversationAttachment | null;
  ask?: AutomationStudioConversationAskInput | null;
  changedAt?: number;
};

export type AutomationStudioConversationAnswerInput = {
  mutationId: string;
  askId: string;
  kind: AutomationStudioConversationAnswerKind;
  value?: string | null;
  actorId?: string | null;
  changedAt?: number;
};

export type AutomationStudioConversationListInput = {
  subjectKind?: AutomationStudioConversationSubjectKind | undefined;
  subjectId?: string | undefined;
  status?: AutomationStudioConversationStatus | undefined;
  limit?: unknown;
};

export type AutomationStudioConversationReadInput = {
  conversationId: string;
  sinceTurnId?: string | undefined;
  limit?: unknown;
};

export function automationStudioConversationAttachmentOrRefuse(value: AutomationStudioConversationAttachment | null): AutomationStudioConversationAttachment | null {
  if (value === null) return null;
  const kind = automationStudioConversationIdOrRefuse(value.kind, "attachment kind");
  const ref = typeof value.ref === "string" ? value.ref.trim() : "";
  if (!ref || ref.length > MAX_ATTACHMENT_REF) throw new Error("Conversation attachment reference is missing or too long.");
  return { kind, ref };
}

export function automationStudioConversationAskOrRefuse(value: AutomationStudioConversationAskInput | null): AutomationStudioConversationAskInput | null {
  if (value === null) return null;
  automationStudioConversationIdOrRefuse(value.askId, "conversation ask");
  if (typeof value.parks !== "boolean") throw new Error("A conversation ask must say whether it parks the work.");
  if (value.kind === "choice" && (!value.options || value.options.length < 2)) throw new Error("A choice must offer at least two options.");
  if (value.options && value.options.length > MAX_OPTIONS) throw new Error(`A choice may offer at most ${MAX_OPTIONS} options.`);
  for (const option of value.options ?? []) {
    if (option.route !== null && option.route !== undefined) automationStudioConversationIdOrRefuse(option.route, "route");
  }
  for (const route of [value.routes?.granted, value.routes?.denied, value.routes?.timedOut]) {
    if (route !== null && route !== undefined) automationStudioConversationIdOrRefuse(route, "route");
  }
  for (const consequence of [...(value.consequences ?? []), ...(value.missing ?? [])]) automationStudioConversationConsequenceOrRefuse(consequence);
  if (value.permissionRequest && value.permissionRequest.requestId !== value.askId) throw new Error("A permission ask is keyed by the request's own requestId.");
  if (value.timeoutMs !== null && value.timeoutMs !== undefined && !(Number.isFinite(value.timeoutMs) && value.timeoutMs > 0)) throw new Error("A conversation ask timeout must be a positive number of milliseconds.");
  return value;
}

/**
 * A consequence class is one of the five Core names and nothing else. It is
 * checked here because the runtime that raises an ask cannot check it: the
 * browser bundle reaches `runtime/parking/` through the approval node, and the
 * consequence vocabulary's own module brings `node:crypto` with it. An
 * unrecognised class would otherwise be stored as though Core had named it, and
 * read back by everything that decides whether an answer may be given in
 * passing.
 */
function automationStudioConversationConsequenceOrRefuse(value: string): AutomationStudioActionConsequence {
  if (!(AUTOMATION_STUDIO_ACTION_CONSEQUENCES as readonly string[]).includes(value)) {
    throw new Error(`A consequence class is one of: ${AUTOMATION_STUDIO_ACTION_CONSEQUENCES.join(", ")}.`);
  }
  return value as AutomationStudioActionConsequence;
}

export function automationStudioConversationTextOrRefuse(value: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("A conversation turn must say something.");
  if (text.length > AUTOMATION_STUDIO_CONVERSATION_TEXT_MAX) throw new Error(`A conversation turn is at most ${AUTOMATION_STUDIO_CONVERSATION_TEXT_MAX} characters.`);
  return text;
}

export function automationStudioConversationShortTextOrRefuse(value: string | null, label: string, max: number): string | null {
  if (value === null) return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (text.length > max) throw new Error(`${label} is at most ${max} characters.`);
  return text;
}

export function automationStudioConversationIdOrRefuse(value: string, kind: string): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!ID.test(id)) throw new Error(`Invalid ${kind} ID.`);
  return id;
}

export function automationStudioConversationChangedAt(value: number | undefined): { changedAt: number } | Record<string, never> {
  return value === undefined ? {} : { changedAt: Math.trunc(value) };
}
