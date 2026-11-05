// @fluxiq-test-group real-sql
// Saving regardless of how it ended is the centre of the pivot (t869, repair of the first paid run:
// a budget-out with a written repeat read "Nothing saved yet"). Every ending, through the real service
// and a scripted model, must leave the best attempt where the next one reads it and where the card reads
// it: through `get-task-attempt`'s read, with `saved` filled. An attempt that did nothing has nothing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioLlmProviderError } from "../../../../../../../runtime/models/failures/index.ts";
import { complete, LOOK_TOOL, READ_LOANS, RENEW_LOAN, runNode, scriptedAttempt, toolCall } from "../../fake-library.ts";
import { LOAN_STEP, LOAN_TASK, PERMITTED, READ_STEP, repeatOverRows } from "../../honest-attempts.ts";
import { laterAttempts, readLoans } from "../../later-attempts.ts";
import { ATLAS, forwardFrom, TITLES } from "../../library-site.ts";
import { outcomeRead, taskKept } from "../saved-read.ts";
import { expectEnded, judgeCalls, judgedNo, keptAttempt } from "../support.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** A purse with room for three decisions and little past them: a call is held at four cents, and one is kept back for the judge (as `carry-on.test.ts`). */
const TIGHT = { instruction: LOAN_TASK, ...PERMITTED, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.13, keepLooking: true };
/** The first attempt's honest work up to its repeat, with no forward run and no completion: what a budget that goes mid-round leaves. */
const written = () => [readLoans(), runNode("first", RENEW_LOAN, { title: ATLAS }, ["modify_existing"], { add: true }), repeatOverRows()];
type Read = Parameters<typeof outcomeRead>[0];

async function expectKept(read: Read, state: "partly_works" | "notes_only") {
  const outcome = await outcomeRead(read);
  expect(outcome.saved).toMatchObject({ state, trust: "unproven" });
  const memory = await taskKept(read);
  // The steps are the task's too, which is what the next attempt starts from, and a draft that never ran is not ready.
  expect(memory?.best?.steps.length).toBeGreaterThan(0);
  expect(memory?.best?.provenWhole).toBe(false);
  const row = (await keptAttempt(read.service, read.projectId, "flow.loans"));
  expect(row?.steps?.length).toBeGreaterThan(0);
  return { outcome, memory, row };
}

const repeatKept = (memory: Awaited<ReturnType<typeof taskKept>>) => memory?.best?.steps.some((step) => step.routing?.kind === "repeat" && step.position === LOAN_STEP) === true;

describe("every ending keeps the best attempt where it is read", () => {
  it("achieved: the draft with its repeat, saved as a draft that never ran", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const { answer } = await lane.attempt({ instruction: LOAN_TASK, ...PERMITTED, script: [...written(), forwardFrom(READ_STEP), complete("Renewed every loan and listed them.")] });
    expect(answer.attempt.status).toBe("achieved");
    const { memory, row } = await expectKept({ service: lane.service, projectId: lane.projectId, answered: answer }, "partly_works");
    expect(row?.candidateId).toMatch(/^candidate\./u);
    expect(repeatKept(memory)).toBe(true);
  });

  it("budget_out with the purse gone mid-round: the draft with its repeat, and the notes, are kept", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const { answer } = await lane.attempt({ ...TIGHT, script: written() });
    expect(answer.attempt.status).toBe("budget_out");
    const { memory, outcome } = await expectKept({ service: lane.service, projectId: lane.projectId, answered: answer }, "partly_works");
    expect(repeatKept(memory)).toBe(true);
    expect(memory?.notes.at(-1)).toMatchObject({ from: "core", failed: expect.stringMatching(/budget/iu) });
    expect(outcome.attempt.status).toBe("budget_out");
  });

  it("budget_out with the purse gone at the judge: the same", async () => {
    const attempt = await scriptedAttempt({
      instruction: LOAN_TASK, ...PERMITTED, resolver: { maxTotalEstimatedCostUsd: 0.1 }, keepLooking: true,
      // The completion's own reply bills far past its estimate, so what was kept back no longer pays for the check (as `judge.test.ts`).
      wrapProvider: (provider) => ({
        ...provider,
        estimateCostUsd: () => 0.002,
        runTask: async (request, execution) => {
          const answered = await provider.runTask(request, execution) as { response?: { decision?: { kind?: string } }; usage?: object };
          return answered.response?.decision?.kind === "complete" ? { ...answered, usage: { ...answered.usage, estimatedCostUsd: 0.0985 } } : answered;
        }
      }),
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), runNode("first", RENEW_LOAN, { title: ATLAS }, ["modify_existing"], { add: true }), complete("Renewed them."), complete("Again.")]
    }, cleanups);
    expectEnded(attempt, "budget_out");
    expect(judgeCalls(attempt)).toHaveLength(0);
    const { memory } = await expectKept(attempt, "partly_works");
    // The repeat is not written in this one: the purse went at the first completion. The steps it did write stay.
    expect(memory?.best?.steps.map((step) => step.actionId)).toContain(RENEW_LOAN);
  });

  it("a person's Stop: the draft is kept", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const stop = () => {
      lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
      return toolCall("look.after", LOOK_TOOL, {});
    };
    const { answer } = await lane.attempt({ instruction: LOAN_TASK, ...PERMITTED, script: [...written(), stop, complete("Never asked.")] });
    expect(answer.attempt.status).toBe("stopped_by_person");
    const { memory } = await expectKept({ service: lane.service, projectId: lane.projectId, answered: answer }, "partly_works");
    expect(repeatKept(memory)).toBe(true);
  });

  it("a provider failing at the very end costs nothing that was kept", async () => {
    let decided = 0;
    const attempt = await scriptedAttempt({
      instruction: LOAN_TASK, ...PERMITTED, judge: [judgedNo("Not yet.")],
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          if (request.taskKind === "evidence_tool_decision" && request.metadata?.source !== "instructionAuthority" && (decided += 1) >= 5) throw new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", "No balance.", false);
          return await provider.runTask(request, execution);
        }
      }),
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), runNode("first", RENEW_LOAN, { title: ATLAS }, ["modify_existing"], { add: true }), repeatOverRows(), complete("Renewed them.")]
    }, cleanups);
    expectEnded(attempt, "budget_out");
    expect(attempt.library.renewals).toEqual({ [ATLAS]: 1 });
    await expectKept(attempt, "partly_works");
  });

  it("steps that could not be assembled stay as notes, and saved says so", async () => {
    // The lane's read names a column this plain target's node does not take, so the draft is refused: a real refusal of a real check.
    const attempt = await scriptedAttempt({ instruction: LOAN_TASK, ...PERMITTED, script: [readLoans(), complete("Listed.")] }, cleanups);
    const answer = expectEnded(attempt, "achieved");
    expect(answer.candidateId).toBeUndefined();
    const { row } = await expectKept(attempt, "notes_only");
    expect(row?.candidateId).toBeUndefined();
    expect(attempt.said.some((line) => line.includes("The steps were not saved as a Flow"))).toBe(true);
  });

  it("budget_out with a draft that could not be assembled: the steps stay as notes, and saved says so (the paid run's shape)", async () => {
    const attempt = await scriptedAttempt({
      instruction: LOAN_TASK, ...PERMITTED, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.04 }, resolver: { maxTotalEstimatedCostUsd: 0.3 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.04 }), keepLooking: true,
      script: [readLoans()]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(answer.candidateId).toBeUndefined();
    const { row } = await expectKept(attempt, "notes_only");
    expect(row?.candidateId).toBeUndefined();
    expect(answer.result?.rows?.totalRows).toBe(3);
  });

  it("an attempt that did nothing has nothing saved", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const { answer } = await lane.attempt({ ...TIGHT, script: [toolCall("look", LOOK_TOOL, {})] });
    expect(answer.attempt.status).toBe("budget_out");
    expect((await outcomeRead({ service: lane.service, projectId: lane.projectId, answered: answer })).saved).toBeUndefined();
  });
});
