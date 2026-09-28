// What a person writes back: a reply, and an answer to an ask.
//
// Both are mutations to the request coordinator (`append-turn` by its prefix,
// `answer-ask` because it is not a read), so both get thirty seconds, no
// retry and no deduplication. Retrying an answer would be wrong anyway: an ask
// is answered once and a second answer is refused.
//
// **The answer goes out flat.** Core's handler reads `askId`, `kind` and
// `value` off the request itself; a nested `answer: { kind, ... }` object
// reaches it as no kind at all and is refused with
// `An answer is one of: grant, deny, choice, text.` before it touches the
// store. So the panel's own `ConversationAnswer` union -- which is the right
// shape to reason about, because it makes an impossible answer unrepresentable
// -- is flattened here, at the wire, and nowhere else.
//
// **And what a person asks the panel to do.** `runConversationCapability` is
// the third thing this module sends, and the one that makes the chat window
// operate the panel rather than only narrate it: it resolves the request
// against the capability registry, runs the capability the control would have
// run, and writes what happened back into the thread as a turn. Before it, a
// person who typed "run the flow" wrote a row into a transcript and nothing
// else happened, because `append-turn` stores text and nobody read it back as
// an instruction.

import type { ProgramCommandTransport } from "../data/program-transport";
import { commitAutomationStudioMutation } from "../stores";
import {
  dispatchPanelCapability,
  type PanelCapabilityContext,
  type PanelCapabilityDispatch,
  type PanelCapabilityRequest
} from "./capabilities";
import { conversationAnswerRequest, type ConversationAnswer } from "./thread";

export type ConversationAppendTurnPayload = {
  projectId: string;
  conversationId: string;
  text: string;
};

export type ConversationAnswerAskPayload = {
  projectId: string;
  answer: ConversationAnswer;
  /** Present only when the answer was re-authorized, and never logged or echoed. */
  authorizationPin?: string;
};

/**
 * The thread a person starts, rather than one a run, a build or a node opened
 * for them.
 *
 * `subjectKind` and `subjectId` are optional together: someone opening the chat
 * with nothing selected is talking about the project, and Core falls back to the
 * project's own id rather than refusing. Core's `openConversation` continues a
 * subject's open thread when there already is one, so asking twice does not
 * leave two threads behind.
 */
export type ConversationOpenPayload = {
  projectId: string;
  subjectKind?: "project" | "flow" | "build" | "run";
  subjectId?: string;
  title?: string;
};

export function startConversation(api: ProgramCommandTransport, payload: ConversationOpenPayload) {
  return api.post<{ conversation?: unknown }>("open-conversation", {
    projectId: payload.projectId,
    ...(payload.subjectKind && payload.subjectId ? { subjectKind: payload.subjectKind, subjectId: payload.subjectId } : {}),
    ...(payload.title ? { title: payload.title } : {})
  });
}

export function appendConversationTurn(api: ProgramCommandTransport, payload: ConversationAppendTurnPayload) {
  return api.post<{ turn?: unknown }>("append-turn", { ...payload });
}

export function answerConversationAsk(api: ProgramCommandTransport, payload: ConversationAnswerAskPayload) {
  return api.post<{ ask?: unknown }>("answer-ask", {
    projectId: payload.projectId,
    ...conversationAnswerRequest(payload.answer),
    ...(payload.authorizationPin ? { authorizationPin: payload.authorizationPin } : {})
  });
}

export type ConversationCapabilityPayload = {
  conversationId: string;
  /** The capability to run, by id or in the person's own words. */
  request: PanelCapabilityRequest;
  /** What the panel currently has open, which fills in what the request left out. */
  context: Omit<PanelCapabilityContext, "transport">;
};

/**
 * Run a panel capability from the conversation, and leave the record in the
 * thread.
 *
 * The turn is written whatever the outcome. A person who asked for something
 * and got nothing back has no way to tell a refusal from a dropped message, and
 * the transcript is the only place either of them is kept. A capability that
 * wants the PIN again writes its turn too: what is owed there is the question,
 * not silence.
 *
 * The turn is best-effort on purpose. The capability has already run by the
 * time it is written, so failing to record it must not be reported as the
 * capability failing -- the dispatch is returned either way, and the change
 * feed is told so any other mounted surface refreshes.
 */
export async function runConversationCapability(
  api: ProgramCommandTransport,
  payload: ConversationCapabilityPayload
): Promise<PanelCapabilityDispatch> {
  const dispatch = await dispatchPanelCapability({ ...payload.context, transport: api }, payload.request);
  const projectId = payload.context.projectId;
  if (projectId) {
    await appendConversationTurn(api, {
      projectId,
      conversationId: payload.conversationId,
      text: conversationCapabilityTurnText(dispatch)
    }).catch(/* best-effort: the capability has already run, so a failure to write the record must not be reported as the capability failing; the dispatch is returned either way and the change feed still fires. */ () => undefined);
    commitConversationChanged({ projectId, conversationId: payload.conversationId });
  }
  return dispatch;
}

/**
 * What the thread says the panel just did.
 *
 * It names the capability whenever the match was not certain, so a person can
 * correct a wrong reading in their next message rather than discovering it in
 * the Flow. Core's own words carry a failure; the panel adds what it was doing
 * and nothing more.
 */
export function conversationCapabilityTurnText(dispatch: PanelCapabilityDispatch): string {
  const title = dispatch.capability?.title ?? "that";
  const took = dispatch.confidence >= 1 ? "" : ` (I took that as "${title}".)`;
  if (dispatch.outcome.status === "done") return `${dispatch.outcome.summary}${took}`;
  if (dispatch.outcome.status === "asks") return `${dispatch.outcome.summary}${took}`;
  return `${dispatch.outcome.summary} ${dispatch.outcome.error}${took}`.trim();
}

/**
 * Tell every other mounted surface that this thread moved. The change feed
 * only fires on a mutation this tab dispatched, so without this a second
 * conversation surface would not see the turn until it polled.
 */
export function commitConversationChanged(detail: { projectId: string | null; conversationId: string; flowId?: string }): void {
  commitAutomationStudioMutation({
    kind: "conversation.changed",
    projectId: detail.projectId,
    conversationId: detail.conversationId,
    ...(detail.flowId ? { flowId: detail.flowId } : {})
  });
}
