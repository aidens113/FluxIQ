// An ask: a turn that expects an answer, and the answer when it arrives.
//
// `askId` is the key the whole mechanism turns on. For a permission ask it is
// the `requestId` of the action-permission request the gate already builds --
// that payload's own header says `requestId` is "the key a store would hold it
// under", and this is that store. So a run that stopped to ask, and a person
// who answers days later, name the same thing without either of them inventing
// an id.
//
// `parks` is the difference between a gate and a dead end. A parked ask means
// the work waits for the answer rather than ending on a refusal; an unparked
// one is a question the work does not depend on. The store records which it
// is; what waiting costs, and how the work resumes, belongs to the runtime.

import type { AutomationStudioActionConsequence } from "../action-permissions/index.ts";
import type { AutomationStudioActionPermissionRequest } from "../action-permissions/index.ts";

export const AUTOMATION_STUDIO_CONVERSATION_ASK_KINDS = ["permission", "choice", "confirm", "open"] as const;
export type AutomationStudioConversationAskKind = (typeof AUTOMATION_STUDIO_CONVERSATION_ASK_KINDS)[number];

export const AUTOMATION_STUDIO_CONVERSATION_ASK_STATUSES = ["pending", "answered", "expired"] as const;
export type AutomationStudioConversationAskStatus = (typeof AUTOMATION_STUDIO_CONVERSATION_ASK_STATUSES)[number];

export const AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS = ["grant", "deny", "choice", "text"] as const;
export type AutomationStudioConversationAnswerKind = (typeof AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS)[number];

/** What happens to a parked ask nobody answered: refuse, or take the option marked as the default. */
export const AUTOMATION_STUDIO_CONVERSATION_ASK_TIMEOUT_ACTIONS = ["deny", "default"] as const;
export type AutomationStudioConversationAskTimeoutAction = (typeof AUTOMATION_STUDIO_CONVERSATION_ASK_TIMEOUT_ACTIONS)[number];

/**
 * One option of a `choice` ask. `id` is what an answer carries back; `label` is
 * what the person reads; `route` is where a parked run goes if this option is
 * the one chosen, overriding the ask's `granted` route for this branch alone.
 */
export type AutomationStudioConversationAskOption = {
  id: string;
  label: string;
  route: string | null;
};

/**
 * Where a parked run resumes, per answer. Without this an ask can stop a run
 * and not say what stopping meant: "approved" and "rejected" have to name
 * branches at the moment the question is asked, not at the moment it is
 * answered, or the same answer could mean different things to different
 * resumers. `builtin.routine.approval` already carries exactly this shape --
 * a prompt, a timeout and a route for nobody responding -- and `timeoutMs`
 * and `onTimeout` above are the timeout half of it.
 *
 * A null route means "none named": the run resumes where it parked. Core does
 * not interpret a route id; it carries it for whatever consumes the answer.
 */
export type AutomationStudioConversationAskRoutes = {
  /** Taken on `grant`, on `text`, and on a `choice` whose option names no route of its own. */
  granted: string | null;
  /** Taken on `deny`, and on a timeout whose `onTimeout` is `deny`. */
  denied: string | null;
  /** Taken when the ask expires and `onTimeout` is `default`. */
  timedOut: string | null;
};

/** What the ask acts on, as the person would recognise it. Both may be null, as on a permission request. */
export type AutomationStudioConversationAskControl = {
  name: string | null;
  kind: string | null;
};

export type AutomationStudioConversationAnswer = {
  askId: string;
  answeredAt: number;
  kind: AutomationStudioConversationAnswerKind;
  /** The option id for `choice`, the person's words for `text`, null for `grant` and `deny`. */
  value: string | null;
  /** Who answered, when the answer came through the API. Null for an answer Core settled itself. */
  actorId: string | null;
};

export type AutomationStudioConversationAsk = {
  /** For a permission ask, the `requestId` of the request the gate built. */
  askId: string;
  conversationId: string;
  /** The turn this ask hangs on: its text is the question. */
  turnId: string;
  kind: AutomationStudioConversationAskKind;
  status: AutomationStudioConversationAskStatus;
  /** True when the work waits for the answer instead of ending. */
  parks: boolean;
  timeoutMs: number | null;
  onTimeout: AutomationStudioConversationAskTimeoutAction | null;
  options: AutomationStudioConversationAskOption[] | null;
  /** Where a parked run resumes for each answer, or null when the ask names no routes. */
  routes: AutomationStudioConversationAskRoutes | null;
  /**
   * Every lasting consequence answering yes would have, in Core's order. A
   * permission ask takes them from its request; a `confirm` or a `choice` that
   * commits something says so here. A caller reads this to decide whether the
   * answer may be given in passing -- see
   * `automationStudioConversationAskIsConsequential`.
   */
  consequences: AutomationStudioActionConsequence[] | null;
  /** For a permission ask, the consequence classes the run was not permitted. */
  missing: AutomationStudioActionConsequence[] | null;
  control: AutomationStudioConversationAskControl | null;
  /** The action-permission request verbatim, when this ask carries one. */
  permissionRequest: AutomationStudioActionPermissionRequest | null;
  createdAt: number;
  /** Null while the ask is pending; an ask is answered once. */
  answer: AutomationStudioConversationAnswer | null;
};

/**
 * Whether an answer of this kind settles an ask of that kind. A permission or
 * a confirmation is granted or refused; a choice names an option; an open
 * question takes words. Anything else is a person answering a question nobody
 * asked, and the store refuses it.
 */
export function automationStudioConversationAnswerFits(ask: AutomationStudioConversationAskKind, answer: AutomationStudioConversationAnswerKind): boolean {
  if (ask === "permission" || ask === "confirm") return answer === "grant" || answer === "deny";
  if (ask === "choice") return answer === "choice";
  return answer === "text";
}

/**
 * What a caller hands the store to raise an ask on a turn. For a permission
 * ask, `askId` is the request's own `requestId` and `permissionRequest` is the
 * request verbatim, so nothing has to be rebuilt to show the person what the
 * gate already said.
 */
export type AutomationStudioConversationAskInput = {
  askId: string;
  kind: AutomationStudioConversationAskKind;
  parks: boolean;
  timeoutMs?: number | null;
  onTimeout?: AutomationStudioConversationAskTimeoutAction | null;
  options?: readonly AutomationStudioConversationAskOption[] | null;
  routes?: AutomationStudioConversationAskRoutes | null;
  consequences?: readonly AutomationStudioActionConsequence[] | null;
  missing?: readonly AutomationStudioActionConsequence[] | null;
  control?: AutomationStudioConversationAskControl | null;
  permissionRequest?: AutomationStudioActionPermissionRequest | null;
};

/**
 * The route a parked run resumes down, given how the ask was settled, or null
 * when nothing was named and it should resume where it parked.
 *
 * This lives beside the ask rather than beside whatever parks the run, so that
 * "what does this answer mean" is read the same way by everything that reads
 * it. A second copy of this mapping is the defect it exists to prevent.
 */
export function automationStudioConversationAskRoute(ask: AutomationStudioConversationAsk): string | null {
  if (!ask.routes && !ask.options) return null;
  const routes = ask.routes;
  if (ask.status === "expired") return (ask.onTimeout === "deny" ? routes?.denied : routes?.timedOut) ?? null;
  const answer = ask.answer;
  if (!answer) return null;
  if (answer.kind === "deny") return routes?.denied ?? null;
  if (answer.kind === "choice") {
    const chosen = (ask.options ?? []).find((option) => option.id === answer.value);
    return chosen?.route ?? routes?.granted ?? null;
  }
  return routes?.granted ?? null;
}

/**
 * The consequence classes that make answering an ask something a person must
 * do deliberately, with the whole question in front of them, rather than from
 * a prompt floating over whatever else they were doing.
 *
 * It is the standing product rule read back: completing a purchase, deleting,
 * and editing existing data are the acts that need the person's real say-so.
 * Sending or publishing is here too, because it reaches other people and
 * cannot be taken back. Only `create_new` is left out: making something new
 * that did not exist is the one class that undoes cleanly.
 */
export const AUTOMATION_STUDIO_CONVERSATION_CONSEQUENTIAL_CLASSES: readonly AutomationStudioActionConsequence[] = Object.freeze([
  "move_money",
  "delete",
  "modify_existing",
  "send_or_publish"
]);

/**
 * Whether answering this ask commits something. A caller that offers a fast
 * way to answer -- a prompt, a notification -- must not offer it for an ask
 * that answers true here; it shows that something needs attention and takes
 * the person to the thread, where the question is in full.
 *
 * A permission ask is consequential when what it lacks is: `missing` is the
 * classes it was refused, and granting them is what the answer does.
 */
export function automationStudioConversationAskIsConsequential(ask: AutomationStudioConversationAsk): boolean {
  const classes = ask.kind === "permission" ? (ask.missing ?? ask.consequences ?? []) : (ask.consequences ?? []);
  return classes.some((consequence) => AUTOMATION_STUDIO_CONVERSATION_CONSEQUENTIAL_CLASSES.includes(consequence));
}
