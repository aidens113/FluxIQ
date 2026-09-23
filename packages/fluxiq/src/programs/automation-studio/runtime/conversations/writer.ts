// The seam Core itself talks through.
//
// A run, a build or a node has a subject and something to say; it does not
// have a conversation id, and should not have to carry one through every call
// that might need to speak. A writer is bound to one subject, opens that
// subject's thread the first time it is used, and keeps it for the rest of the
// unit of work. So the code that raises a question reads as raising a
// question.
//
// `askPermission` is the one that matters today. It takes the request the
// action-permission gate already builds and files it as an ask keyed by that
// request's own `requestId`, with Core's own sentence as the turn's words. The
// payload does not change, nothing is rebuilt, and the run that stopped and
// the person who answers a day later name the same thing.

import type { AutomationStudioActionPermissionRequest } from "../action-permissions/index.ts";
import type { AutomationStudioConversationAskInput, AutomationStudioConversationAskRoutes, AutomationStudioConversationAskTimeoutAction } from "./ask.ts";
import type { AutomationStudioConversation, AutomationStudioConversationSubject } from "./thread.ts";
import type { AutomationStudioConversationAttachment, AutomationStudioConversationTurn } from "./turn.ts";

/** Opening a subject's thread. Without `conversationId` the holder mints one. */
export type AutomationStudioConversationOpenRequest = {
  projectId: string;
  subject: AutomationStudioConversationSubject;
  title: string | null;
  conversationId?: string;
};

/** One turn Core itself writes, with the ask it carries and the thing it shows. */
export type AutomationStudioConversationAutomationTurnRequest = {
  projectId: string;
  conversationId: string;
  text: string;
  ask: AutomationStudioConversationAskInput | null;
  attachment: AutomationStudioConversationAttachment | null;
};

/** What a writer needs from whatever holds the store. The conversations collaborator satisfies it. */
export type AutomationStudioConversationWriterHost = {
  openConversation(input: AutomationStudioConversationOpenRequest): Promise<AutomationStudioConversation>;
  appendAutomationTurn(input: AutomationStudioConversationAutomationTurnRequest): Promise<AutomationStudioConversationTurn>;
};

/** How a permission ask behaves while it waits. `parks` defaults to true: a question that ends the run is what this replaces. */
export type AutomationStudioConversationPermissionAskOptions = {
  parks?: boolean;
  timeoutMs?: number;
  onTimeout?: AutomationStudioConversationAskTimeoutAction;
  /** Where the parked run resumes once the person answers. */
  routes?: AutomationStudioConversationAskRoutes;
  attachment?: AutomationStudioConversationAttachment;
};

/** One subject's thread, bound. Core posts turns and raises asks through this and nothing else. */
export type AutomationStudioConversationWriter = {
  readonly projectId: string;
  readonly subject: AutomationStudioConversationSubject;
  /** The thread's id, opening it if this is the first thing said. */
  conversationId(): Promise<string>;
  /** Say something. No answer is expected and nothing waits. */
  say(text: string, attachment?: AutomationStudioConversationAttachment): Promise<AutomationStudioConversationTurn>;
  /** Ask something, in whatever shape the question takes. */
  ask(input: { text: string; ask: AutomationStudioConversationAskInput; attachment?: AutomationStudioConversationAttachment }): Promise<AutomationStudioConversationTurn>;
  /** Ask for permission to take an action, from the request the gate built. */
  askPermission(request: AutomationStudioActionPermissionRequest, options?: AutomationStudioConversationPermissionAskOptions): Promise<AutomationStudioConversationTurn>;
};

export function automationStudioConversationWriter(input: {
  host: AutomationStudioConversationWriterHost;
  projectId: string;
  subject: AutomationStudioConversationSubject;
  title?: string | null;
  conversationId?: string;
}): AutomationStudioConversationWriter {
  let opening: Promise<AutomationStudioConversation> | undefined;
  const conversationId = async (): Promise<string> => {
    opening ??= input.host.openConversation({
      projectId: input.projectId,
      subject: input.subject,
      title: input.title ?? null,
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId })
    });
    try {
      return (await opening).conversationId;
    } catch (error) {
      // A failed open is not remembered. Caching the rejected promise would
      // make one unavailable database silence this writer for the rest of the
      // run, which is exactly the run that most needs to be able to speak.
      opening = undefined;
      throw error;
    }
  };
  const post = async (text: string, ask: AutomationStudioConversationAskInput | null, attachment: AutomationStudioConversationAttachment | undefined): Promise<AutomationStudioConversationTurn> =>
    input.host.appendAutomationTurn({ projectId: input.projectId, conversationId: await conversationId(), text, ask, attachment: attachment ?? null });
  return {
    projectId: input.projectId,
    subject: input.subject,
    conversationId,
    say: (text, attachment) => post(text, null, attachment),
    ask: (request) => post(request.text, request.ask, request.attachment),
    askPermission: (request, options) => post(request.sentence, automationStudioConversationPermissionAsk(request, options), options?.attachment)
  };
}

/**
 * The ask a permission request becomes. `askId` is the request's `requestId`,
 * `missing` is what a later grant must add, and the request travels whole so
 * the reader shows exactly what Core built rather than a summary of it.
 */
export function automationStudioConversationPermissionAsk(request: AutomationStudioActionPermissionRequest, options?: AutomationStudioConversationPermissionAskOptions): AutomationStudioConversationAskInput {
  return {
    askId: request.requestId,
    kind: "permission",
    parks: options?.parks ?? true,
    timeoutMs: options?.timeoutMs ?? null,
    onTimeout: options?.onTimeout ?? null,
    options: null,
    routes: options?.routes ?? null,
    // What the action would do, and what it was refused: a caller deciding
    // whether this may be answered in passing reads the second.
    consequences: request.consequences,
    missing: request.missing,
    control: { name: request.control.name, kind: request.control.kind },
    permissionRequest: request
  };
}
