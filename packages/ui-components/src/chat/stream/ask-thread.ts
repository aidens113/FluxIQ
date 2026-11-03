// The thread that holds the question work is waiting on, as a chat target.
// No DOM.
//
// Core puts a question to the person in the thread of the work's own
// subject, not in the thread the work was started from (the `conversationId`
// its activity events carry, which is the chat that asked for it, if any):
//
//   build  its Flow's thread: Core subject `flow`, the Flow's id. A build's
//          permission question and its check only a person can complete both
//          go there (Core `runtime/service.ts`, `parkingPort({ subject: { kind:
//          "flow", id: flowId } })`).
//   run    the run's own thread: Core subject `run`, the run's id (graph-run
//          parking, `parkingPort({ subject: { kind: "run", id: runId } })`).
//
// So "Waiting for you" can show in a chat that does not hold the question, or
// the question can sit in a thread no chat shows (a run started from the
// automations tab). `askThread` names the thread that holds it, so the chat
// can open it and the person can answer there. Undefined when nothing is
// waiting on the person, or when a waiting build named no Flow, since then
// there is no thread to find.

import type { ChatActivityState } from "../ports/index.ts";
import type { ChatTarget } from "../target.ts";

/** A chat target for the thread a build or a run asked its question in. */
export type QuestionTarget = Extract<ChatTarget, { kind: "question" }>;

/** The thread holding the question the paced display says the work is waiting on. */
export function askThread(state: ChatActivityState): QuestionTarget | undefined {
  const display = state.display;
  if (!display || display.outcome !== "waiting") return undefined;
  const { activityId } = display;
  const events = [...state.recent, ...(state.current ? [state.current] : [])].filter((event) => event.activityId === activityId);
  const subject = events[events.length - 1]?.subject;
  if (subject === undefined) return undefined;
  const scope = typeof subject.projectId === "string" && subject.projectId !== "" ? { projectId: subject.projectId } : {};
  if (subject.kind === "run") {
    return subject.id ? { kind: "question", activityId, subjectKind: "run", subjectId: subject.id, title: "The run's question", ...scope } : undefined;
  }
  const flowId = events.map((event) => event.subject.flowId).find((id) => typeof id === "string" && id !== "");
  return flowId === undefined ? undefined : { kind: "question", activityId, subjectKind: "flow", subjectId: flowId, title: "The build's question", ...scope };
}
