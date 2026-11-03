// Which thread the chat opens so the person watches a followed run's steps
// live (the host switched to the chat because the run started).
// No DOM.
//
// Whether a chat shows a run is `activityForTarget`'s rule, asked of the run's
// own event, so the two never disagree:
//
//   - A run that speaks through no thread (started from the automations strip,
//     or over the API) shows in the latest chat and in its own automation's
//     chat. The automation's chat is preferred when the panel knows the Flow's
//     name, since that chat is about this run alone; otherwise the latest.
//   - A run that speaks through a thread (`conversationId`: started from a
//     chat) shows only in that thread. The chat opens the latest chat or the
//     Flow's chat only when it has read that thread before and knows its id
//     is the run's; otherwise it opens the run's own thread (a `question`
//     target of subject `run`), where every event of the run shows and where
//     Core would ask the person anything the run needs.
//   - A chat that already shows the run is kept: the person is not moved.

import type { ChatActivityState } from "../ports/index.ts";
import type { ClientGatewayActivity } from "fluxiq/ui";
import type { ChatTarget } from "../target.ts";
import { activityForTarget } from "./target-activity.ts";

/** What the chat knows when it decides. */
export type RunTargetInput = {
  /** The followed run's latest event. */
  readonly run: ClientGatewayActivity;
  /** The thread on screen, and its conversation id once read. */
  readonly target: ChatTarget;
  readonly conversationId: string | undefined;
  /** The Flow's name, when the panel has seen it. */
  readonly flowName: string | undefined;
  /** The conversation ids of threads this chat has read, by `threadKey`. */
  readonly known: ReadonlyMap<string, string>;
};

/** The target that shows `run`'s steps, or null when the thread on screen already does. */
export function followedRunTarget({ run, target, conversationId, flowName, known }: RunTargetInput): ChatTarget | null {
  if (shows(run, target, conversationId)) return null;
  const scope = target.projectId === undefined ? {} : { projectId: target.projectId };
  const latest: ChatTarget = { kind: "latest", ...scope };
  const flowId = run.subject.flowId;
  const automation: ChatTarget | null = flowId !== undefined && flowName !== undefined && flowName.trim() !== ""
    ? { kind: "automation", flowId, name: flowName, ...scope }
    : null;
  for (const candidate of [automation, latest]) {
    if (candidate === null) continue;
    if (run.conversationId === undefined) {
      if (shows(run, candidate, undefined)) return candidate;
      continue;
    }
    const id = known.get(threadKey(candidate));
    if (id !== undefined && shows(run, candidate, id)) return candidate;
  }
  return {
    kind: "question",
    activityId: run.activityId,
    subjectKind: "run",
    subjectId: run.subject.id,
    title: flowName !== undefined && flowName.trim() !== "" ? `Run of ${flowName.trim()}` : "This run",
    ...scope
  };
}

/** A key naming a thread whatever its display name: the same key as `sameThread`'s idea of the same thread. */
export function threadKey(target: ChatTarget): string {
  const scope = target.projectId ?? "";
  switch (target.kind) {
    case "latest": return JSON.stringify(["latest", scope]);
    case "project": return JSON.stringify(["project", scope]);
    case "automation": return JSON.stringify(["automation", scope, target.flowId]);
    case "question": return JSON.stringify(["question", scope, target.subjectKind, target.subjectId]);
  }
}

/** True when `target`'s chat, whose thread is `conversationId`, shows `run`'s steps. */
function shows(run: ClientGatewayActivity, target: ChatTarget, conversationId: string | undefined): boolean {
  const state: ChatActivityState = { current: run, display: null, recent: [run], history: [run], overlay: "hidden", live: true };
  return activityForTarget(state, target, conversationId).events.some((event) => event.activityId === run.activityId);
}
