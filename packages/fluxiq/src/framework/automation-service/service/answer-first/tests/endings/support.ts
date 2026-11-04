// What the tests of the keep-going table share: reading an attempt's answer, and the checks each
// ending makes. Every row asserts where it ended, what it kept, that no lasting act was repeated,
// and that nothing hung, since a hung attempt is stopped by the fake and would read as a Stop.

import { expect } from "vitest";
import type { AutomationStudioFlowPaths } from "../../../paths/index.ts";
import type { AutomationStudioService } from "../../../../service.ts";
import { judgeReply } from "../../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioAnswerFirstAttemptPorts, automationStudioAnswerFirstAttemptStoreOf } from "../../index.ts";
import type { scriptedAttempt } from "../fake-library.ts";

export type Attempt = Awaited<ReturnType<typeof scriptedAttempt>>;

/** The attempt's answer. It always answers: anything else is what this path promises never to be. */
export function answerOf(attempt: Attempt) {
  if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
  return attempt.answered;
}

export const decisions = (attempt: Pick<Attempt, "requests">) => attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision");
export const judgeCalls = (attempt: Pick<Attempt, "requests">) => attempt.requests.filter((request) => request.taskKind === "loop_verification");

/** What ended it, that nothing hung, that the script did not simply run out, and that no lasting act landed more times than the request asks. */
export function expectEnded(attempt: Attempt, status: "achieved" | "budget_out" | "stopped_by_person", asked = 1): ReturnType<typeof answerOf> {
  expect(attempt.hung).toBe(false);
  expect(attempt.scriptRanOut).toBe(false);
  for (const times of Object.values(attempt.library.renewals)) expect(times).toBeLessThanOrEqual(asked);
  const answer = answerOf(attempt);
  expect(answer.attempt.status).toBe(status);
  expect(answer.attempt.endedAtMs).toBeDefined();
  return answer;
}

/** The result was reached, confirmed by a judge's yes. */
export function expectReached(attempt: Attempt, asked = 1): ReturnType<typeof answerOf> {
  const answer = expectEnded(attempt, "achieved", asked);
  expect(answer.result?.label).toBe("confirmed");
  expect(answer.attempt.spend.usd).toBeGreaterThan(0);
  expect(answer.attempt.spend.calls).toBeGreaterThan(0);
  return answer;
}

/** The target saw each lasting act this many times, and nothing else was acted on. */
export function expectPresses(attempt: Pick<Attempt, "library">, presses: Record<string, number>): void {
  expect(attempt.library.renewals).toEqual(presses);
}

/** A judge's no with a located defect, which is what makes it a no. */
export const judgedNo = (observed = "Not there yet.") => judgeReply("no", { expected: "What was asked.", observed, defects: [{ kind: "other", row: "the result", requestWords: "the task" }] });
export const judgedUnsure = () => judgeReply("unknown", { observed: "It could not be told from this." });

/** Replaces the attempt's wait with one that only notes how long it would have been. */
export function noWaiting(waits: number[] = []): (service: AutomationStudioService) => void {
  return (service) => { automationStudioAnswerFirstAttemptPorts(service).sleep = async (ms) => { waits.push(ms); }; };
}

type Owned = Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1] & { projectPaths: Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1]["paths"]; flowPaths: AutomationStudioFlowPaths; projects: Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1]["projects"] };

/** The attempt's kept row. */
export async function keptAttempt(service: AutomationStudioService, projectId: string, flowId: string) {
  const owned = service as unknown as Owned;
  return await automationStudioAnswerFirstAttemptStoreOf(service, { paths: owned.projectPaths, flows: owned.flowPaths, projects: owned.projects }).latest(projectId, flowId);
}

/** The question the Flow's thread holds, once there is one. */
export async function pendingAsk(service: AutomationStudioService, projectId: string, flowId: string, kind?: string): Promise<{ askId: string; timeoutMs: number | null; onTimeout: string | null; kind: string; control?: { kind?: string | null } | null; options?: readonly { id: string }[] | null }> {
  for (let tries = 0; tries < 2_000; tries += 1) {
    const [conversation] = await service.conversations.listConversations({ projectId, subject: { kind: "flow", id: flowId } });
    const thread = conversation ? await service.conversations.getConversation({ projectId, conversationId: conversation.conversationId }) : null;
    const ask = thread?.turns.map((turn) => turn.ask).find((each) => each?.status === "pending" && (kind === undefined || each.control?.kind === kind));
    if (ask) return ask;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The attempt never asked.");
}

/** Runs the attempt, then answers the service it was given when the test is ready to. */
export function held(): { before: (service: AutomationStudioService, project: { projectId: string; flowId: string }) => void; ready: () => Promise<{ service: AutomationStudioService; projectId: string; flowId: string }> } {
  let found: { service: AutomationStudioService; projectId: string; flowId: string } | undefined;
  return {
    before: (service, project) => { found = { service, ...project }; },
    ready: async () => {
      while (!found) await new Promise((resolve) => setTimeout(resolve, 25));
      return found;
    }
  };
}
