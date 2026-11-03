// Which thread the chat reads and where its messages go, for each target.
// No DOM.
//
//   latest      the project's own open thread (`list-conversations`, open,
//               subject kind `project`, limit 1). Not the most recently touched
//               thread of any kind: that is an automation's thread just after
//               the person used it, or a run's, so "Latest chat" would show the
//               automation they just left. The relay fills in the subject id,
//               which is the project id. A first message opens the project's
//               thread (`open-conversation` with no subject is the project).
//   automation  the open thread whose subject is that Flow (Core's subject
//               kind `flow`, id the Flow's id); a first message opens it with
//               that subject and the automation's name as its title. Core's
//               `open-conversation` continues the subject's open thread when
//               there is one, so a thread opened elsewhere (FluxIQ's own chat)
//               is the same thread here. Every message also says the Flow is on
//               screen (`onScreen.flowId`), which is what makes Core read "run
//               it" or "change the price column" as about this automation.
//   question    the open thread a build or a run asked the person in: the
//               target's own subject (`flow` and the Flow's id for a build,
//               `run` and the run's id for a run), which is where Core's
//               parking port writes the ask. A message there says which Flow
//               or run is on screen.
//
// A message may also carry a recording the person attached (`recordingId`):
// it joins `onScreen`, beside any Flow or run, and Core links it to the Flow the
// chat creates.
//
// The client's transport passes these fields to Core unchanged, apart from the
// project thread's subject id (the extension's background relay fills it in).

import type { ChatOnScreen, ChatSend, ChatThreadListQuery } from "../ports/index.ts";
import type { ChatTarget } from "../target.ts";

/** The thread on screen, when there is one. */
export type ShownThread = { conversationId: string; projectId: string };

/** Core's subject kind for a thread about one Flow. */
const FLOW_SUBJECT = "flow";
/** Core's subject kind for the project's own thread. */
const PROJECT_SUBJECT = "project";

/** The query that finds `target`'s thread. */
export function threadListRequest(target: ChatTarget): ChatThreadListQuery {
  const query: ChatThreadListQuery = { subjectKind: PROJECT_SUBJECT, status: "open", limit: 1 };
  if (target.projectId !== undefined) {
    query.projectId = target.projectId;
  }
  if (target.kind === "automation") {
    query.subjectKind = FLOW_SUBJECT;
    query.subjectId = target.flowId;
  } else if (target.kind === "question") {
    query.subjectKind = target.subjectKind;
    query.subjectId = target.subjectId;
  }
  return query;
}

/** The message that sends `text` to `target`: into `shown` when there is one, or into a thread opened for it. */
export function threadSendRequest(target: ChatTarget, shown: ShownThread | undefined, text: string, recordingId?: string): ChatSend {
  const message: ChatSend = { text, conversationId: shown?.conversationId, projectId: shown?.projectId };
  let onScreen: ChatOnScreen | undefined;
  if (target.projectId !== undefined) {
    message.projectId = target.projectId;
    if (shown === undefined && (target.kind === "project" || target.kind === "latest")) {
      message.subjectKind = PROJECT_SUBJECT;
      message.subjectId = target.projectId;
    }
  }
  if (target.kind === "automation") {
    onScreen = { flowId: target.flowId };
    if (shown === undefined) {
      message.subjectKind = FLOW_SUBJECT;
      message.subjectId = target.flowId;
      message.title = target.name;
    }
  } else if (target.kind === "question") {
    onScreen = target.subjectKind === FLOW_SUBJECT ? { flowId: target.subjectId } : { runId: target.subjectId };
    if (shown === undefined) {
      message.subjectKind = target.subjectKind;
      message.subjectId = target.subjectId;
    }
  }
  if (recordingId !== undefined) {
    onScreen = { ...onScreen, recordingId };
  }
  if (onScreen !== undefined) {
    message.onScreen = onScreen;
  }
  return message;
}
