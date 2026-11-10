// What the chat says of an achieved attempt (task speed S9): a replay accepted on its own record says
// it ran exactly as the run the person accepted and was not checked again; a judged result says it was
// checked. Never "checked once against what you asked" for a result nothing checked.
import { describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS } from "../../../../framework/automation-service/service/answer-first/completion/index.ts";
import { automationStudioConversationAttemptOutcome } from "../answer-first/index.ts";
import type { AutomationStudioConversationAnswered } from "../build.ts";
import { automationStudioConversationCommandProgress } from "../progress.ts";

const attempt = {
  taskId: "task.1", attemptId: "attempt.2", ordinal: 2, projectId: "project.1", flowId: "flow.1", path: "run_flow", status: "achieved",
  spend: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms: 100 }, budget: { usd: 5 }, liveSteps: 17, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1, endedAtMs: 2
} as AutomationStudioConversationAnswered["attempt"];

const result = (checkedWhat: string): AutomationStudioTaskResult => ({ attemptId: "attempt.2", kind: "rows", label: "confirmed", timesChecked: 1, checkedWhat } as unknown as AutomationStudioTaskResult);

function said(answered: AutomationStudioConversationAnswered): string | undefined {
  return automationStudioConversationAttemptOutcome(automationStudioConversationCommandProgress("Create an automation here", null), answered).summary;
}

describe("what the chat says of an achieved attempt", () => {
  it("says a replay accepted on its record ran exactly as the accepted run, with no check", () => {
    const words = said({ ok: true, status: "answered", attempt, result: result(AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS) });
    expect(words).toBe("I ran the saved Flow, and it went exactly as the run you accepted, so no check was needed.");
    expect(words).not.toContain("checked once");
  });

  it("says a judged result was checked", () => {
    expect(said({ ok: true, status: "answered", attempt, result: result("the list of saved tables") })).toBe("I got what you asked for, and it was checked once against what you asked.");
    expect(said({ ok: true, status: "answered", attempt })).toBe("I got what you asked for, and it was checked once against what you asked.");
  });
});
