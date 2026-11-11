// Whether a run still uses a thread, as far as what Core keeps outside the
// thread can say: what a delete must rule out before it removes the thread.
//
// A run reaches a thread in four ways, and this answers for the two that are
// kept outside it. A run parked on one of the thread's asks is decided by the
// store, inside the removal's own transaction; work the chat started from the
// thread that is still running in this process is decided by the conversations
// collaborator (`runtime/conversations/commands/work.ts`). Here:
//
// - **The thread's own subject.** A run's questions and its ending go to the
//   thread of `{ kind: "run", id: runId }`, and a build's to its Flow's, through
//   a writer that holds the thread's id for as long as it runs. A run of that id,
//   or for a Flow's thread a run of that Flow, that has not ended still writes
//   there.
// - **The task attempts the thread holds** (`answer-first/attempt-store/`): one
//   still working or waiting for the person was started from this thread and
//   tells its ending there. Read the way a person's read is, so a row a Core that
//   died left `working` reads as interrupted and does not hold the thread for ever.
//
// A record that cannot be read throws, as it does for a person's read: a thread
// is never removed on the strength of a file nobody could read.

import type { AutomationStudioConversation } from "../../../../runtime/conversations/index.ts";
import { automationStudioAnswerFirstAttemptStoreOf, automationStudioAnswerFirstOutcomesOfConversation } from "../answer-first/attempt-store/index.ts";
import { automationStudioAnswerFirstAttemptsRead } from "../answer-first/interrupted/index.ts";
import { isTerminalRuntimeSessionStatus } from "../runtime-session/index.ts";
import type { AutomationStudioRuntimeSession } from "../../../../flows/authoring/model/index.ts";

/** The attempt statuses that have not ended: the rest are endings (`@fluxiq/contracts/automation`). */
const STILL_GOING: ReadonlySet<string> = new Set(["working", "waiting_for_person"]);

/** Whether a run Core keeps a record of still uses a thread. */
export type AutomationStudioConversationRunLinks = {
  usesThread(projectId: string, conversation: AutomationStudioConversation): Promise<boolean>;
};

type Ports = Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1];

/** What the run links read: the service's runs, and where its task attempts are kept. Read only when asked. */
export type AutomationStudioConversationRunLinkService = {
  readonly projectPaths: Ports["paths"];
  readonly flowPaths: Ports["flows"];
  readonly projects: Ports["projects"];
  listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]>;
};

/**
 * The run links of a service. Nothing on it is read until a delete asks, so
 * registering the endpoints touches nothing on the service. `service` is also
 * the owner the attempt store and its live attempts are keyed by, as every
 * other read of attempts passes it.
 */
export function automationStudioConversationRunLinks(service: AutomationStudioConversationRunLinkService): AutomationStudioConversationRunLinks {
  return {
    async usesThread(projectId, conversation) {
      if (await subjectRunActive(service, projectId, conversation)) return true;
      const ports: Ports = { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects };
      const source = { locator: automationStudioAnswerFirstAttemptStoreOf(service, ports).locator, list: automationStudioAnswerFirstAttemptsRead(service, ports).list };
      const outcomes = await automationStudioAnswerFirstOutcomesOfConversation(source, projectId, conversation.conversationId);
      return outcomes.some((outcome) => STILL_GOING.has(outcome.attempt.status));
    }
  };
}

async function subjectRunActive(service: AutomationStudioConversationRunLinkService, projectId: string, conversation: AutomationStudioConversation): Promise<boolean> {
  const { kind, id } = conversation.subject;
  if (kind !== "run" && kind !== "flow") return false;
  const sessions = await service.listRuntimeSessions(projectId);
  return sessions.some((session) => !isTerminalRuntimeSessionStatus(session.status) && (kind === "run" ? session.runId === id : session.flowId === id));
}
