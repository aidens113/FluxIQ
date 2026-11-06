// @fluxiq-test-group real-sql
// A Flow a later attempt proved goes into the person's Flow, and a person's own edit never gets
// replaced (t870), through the real service, the real apply path and the real engine. Provider-free:
// the model and the judge are scripts, on a lending library that counts presses.
import { afterEach, describe, expect, it, vi } from "vitest";
import { automationStudioAnswerFirstKnownFlow } from "../../route/index.ts";
import { automationStudioAnswerFirstSavedStateOf } from "../../task-memory/index.ts";
import { judgedNo } from "../../tests/endings/support.ts";
import { complete, READ_LOANS, RENEW_CARD, RENEW_LOAN } from "../../tests/fake-library.ts";
import { CARD_TASK, cardFirstAttempt, honestFirstAttempt, LOAN_STEP, LOAN_TASK, onceEach, PERMITTED, READ_STEP, repeatOverRows } from "../../tests/honest-attempts.ts";
import { readLoans, TASK } from "../../tests/later-attempts.ts";
import { ATLAS, forwardFrom, TITLES, writeStep } from "../../tests/library-site.ts";
import { appliedLane, baseOf, changesOn, FLOW, flowAsItStands, graphOf, personRuns, stepsInTheFlow } from "./applied-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const PART_NOT_WRITTEN = "Part of the record was not written";
const firstAttempt = { script: [readLoans(), complete("Listed.")] };
const again = { instruction: LOAN_TASK, ...PERMITTED };
/** A person's Run again: the press that means do it again, with an empty act record (t869). */
const pressedAgain = { ...again, runAgain: true };
const LENGTHEN = "Extend";
/** The press written again under a renamed control, and made the repeat the old one was. */
const repaired = () => ({
  ...again,
  script: [writeStep(RENEW_LOAN, { title: ATLAS, control: LENGTHEN }), { kind: "amend_draft", amendments: [{ step: LOAN_STEP, change: "drop" }, { step: 5, change: "reorder", to: LOAN_STEP }] }, repeatOverRows(LOAN_STEP, READ_STEP), forwardFrom(READ_STEP), complete("Renewed every loan.")]
});
const spent = (attempt: { answer: { attempt: { spend: { calls: number; usd: number; inputTokens: number; outputTokens: number } } } }) => {
  const { calls, usd, inputTokens, outputTokens } = attempt.answer.attempt.spend;
  return { calls, usd, inputTokens, outputTokens };
};
const partNotWritten = (said: readonly string[]) => said.filter((line) => line.startsWith(PART_NOT_WRITTEN));

describe("a whole run judged yes with no model", () => {
  it("goes into the person's Flow with no question, leaves the answer as it was, and a whole attempt 3 costs the same", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt(firstAttempt);
    expect(await stepsInTheFlow(lane)).toEqual([]);
    expect(await changesOn(lane)).toEqual([]);
    expect(await baseOf(lane)).toEqual({ flowId: FLOW, digest: await lane.service.getLlmExecutionDependencyDigest(lane.projectId, FLOW) });

    const second = await lane.attempt({});
    expect(second.decisions).toHaveLength(0);
    expect(second.judgeCalls).toHaveLength(1);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect(second.answer.result).toMatchObject({ kind: "rows", source: "flow", label: "confirmed", timesChecked: 1 });
    expect(second.answer.result?.rows?.totalRows).toBeGreaterThan(0);
    expect(partNotWritten(lane.said)).toEqual([]);

    expect(await stepsInTheFlow(lane)).toContain(READ_LOANS);
    const [change, ...others] = await changesOn(lane);
    expect(others).toEqual([]);
    expect(change).toMatchObject({ status: "applied", application: { appliedBy: "runtime" } });
    expect(change?.permissionRequest).toBeUndefined();
    const digest = await lane.service.getLlmExecutionDependencyDigest(lane.projectId, FLOW);
    expect(await baseOf(lane)).toMatchObject({ flowId: FLOW, digest, applied: { adaptationId: change?.adaptationId, attemptId: second.answer.attempt.attemptId } });
    expect((await baseOf(lane))?.keptAsDraftSinceMs).toBeUndefined();
    expect(automationStudioAnswerFirstSavedStateOf(await lane.kept())).toMatchObject({ state: "ready", trust: "provisional", flowId: FLOW });
    expect(await automationStudioAnswerFirstKnownFlow(lane.service, lane.stores, { projectId: lane.projectId, instructionText: TASK })).toBe(FLOW);

    const standing = await flowAsItStands(lane);
    const third = await lane.attempt({});
    expect(third.decisions).toHaveLength(0);
    expect(third.judgeCalls).toHaveLength(1);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(spent(third)).toEqual(spent(second));
    expect(third.answer.result?.rows?.totalRows).toBe(second.answer.result?.rows?.totalRows);
    expect(lane.target.reads).toBe(2);
    // The same steps, already there: nothing is applied, and the Flow is not touched.
    expect(await changesOn(lane)).toHaveLength(1);
    expect(await flowAsItStands(lane)).toBe(standing);
  });

  it("goes into a new blank Flow the chat made for the same ask, and the Flow the steps came from stays as it was", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt({ ...firstAttempt, flowId: "flow.first" });
    const second = await lane.attempt({ flowId: "flow.second" });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect(await stepsInTheFlow(lane, "flow.second")).toContain(READ_LOANS);
    expect(await stepsInTheFlow(lane, "flow.first")).toEqual([]);
    expect(await changesOn(lane, "flow.first")).toEqual([]);
    const third = await lane.attempt({ flowId: "flow.second" });
    expect(third.decisions).toHaveLength(0);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(await changesOn(lane, "flow.second")).toHaveLength(1);
  });

  it("a person's first \"run it\" of the applied Flow does not press what the attempt just pressed, and their second does", async () => {
    const { lane, target } = await appliedLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    const second = await lane.attempt({ instruction: CARD_TASK, ...PERMITTED, runAgain: true });
    expect(second.answer.attempt.path).toBe("run_flow");
    expect(await stepsInTheFlow(lane)).toContain(RENEW_CARD);
    expect(target.library.renewals.card).toBe(2);
    const first = await personRuns(lane);
    expect(first.status).toBe("succeeded");
    expect(target.library.renewals.card).toBe(2);
    const next = await personRuns(lane);
    expect(next.status).toBe("succeeded");
    expect(target.library.renewals.card).toBe(3);
  });
});

describe("what is no edit of a person's", () => {
  it("looking at the Flow, before or after it is applied, and running it: a repaired Flow still replaces this task's own apply", async () => {
    const made = await appliedLane(cleanups);
    const { lane } = made;
    const look = async (flowId: string) => { await lane.service.getFlowGraphViewport({ projectId: lane.projectId, flowId, bounds: { minX: -9, minY: -9, maxX: 9, maxY: 9 } }); };
    await lane.attempt(honestFirstAttempt());
    await look(FLOW);
    await lane.attempt(again);
    expect((await changesOn(lane)).map((change) => change.status)).toEqual(["applied"]);
    const digest = await lane.service.getLlmExecutionDependencyDigest(lane.projectId, FLOW);
    await look(FLOW);
    await look((await graphOf(lane))!.flowId);
    expect(await lane.service.getLlmExecutionDependencyDigest(lane.projectId, FLOW)).toBe(digest);
    await personRuns(lane);
    expect(await lane.service.getLlmExecutionDependencyDigest(lane.projectId, FLOW)).toBe(digest);
    made.site.loanControl = LENGTHEN;
    await lane.attempt({ ...repaired(), runAgain: true });
    await lane.attempt(pressedAgain);
    expect((await changesOn(lane)).map((change) => change.status)).toEqual(["applied", "applied"]);
    expect((await graphOf(lane))?.nodes.find((node) => node.definitionId === RENEW_LOAN)?.parameterValues).toMatchObject({ control: LENGTHEN });
  });
});

describe("a person's own edit", () => {
  it("between attempts 1 and 2: untouched to the byte, the Flow stays a draft, and attempt 3 still uses the saved steps", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt(firstAttempt);
    const flow = await lane.service.getFlow(lane.projectId, FLOW);
    await lane.service.saveFlow({ projectId: lane.projectId, flow: { ...flow, name: "My loans", description: "Written by the person." } });
    const edited = await flowAsItStands(lane);

    const second = await lane.attempt({});
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(second.answer.result?.rows?.totalRows).toBeGreaterThan(0);
    expect(await flowAsItStands(lane)).toBe(edited);
    expect(await changesOn(lane)).toEqual([]);
    expect((await baseOf(lane))?.keptAsDraftSinceMs).toEqual(expect.any(Number));
    expect(partNotWritten(lane.said)).toEqual([]);
    expect(automationStudioAnswerFirstSavedStateOf(await lane.kept())).toMatchObject({ state: "ready", trust: "provisional" });

    const third = await lane.attempt({});
    expect(third.decisions).toHaveLength(0);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(third.answer.result?.source).toBe("flow");
    expect(await flowAsItStands(lane)).toBe(edited);
    expect(await changesOn(lane)).toEqual([]);
  });

  it("to the Flow this task applied: a repaired Flow proven whole does not replace it", async () => {
    const made = await appliedLane(cleanups);
    const { lane } = made;
    await lane.attempt(honestFirstAttempt());
    await lane.attempt(again);
    const graph = (await graphOf(lane))!;
    await lane.service.saveFlow({ projectId: lane.projectId, flow: { ...graph, description: "The person's own words on this graph." } });
    const edited = await flowAsItStands(lane);
    made.site.loanControl = LENGTHEN;
    await lane.attempt({ ...repaired(), runAgain: true });
    const fourth = await lane.attempt(pressedAgain);
    expect(fourth.decisions).toHaveLength(0);
    expect(fourth.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(await flowAsItStands(lane)).toBe(edited);
    expect(await changesOn(lane)).toHaveLength(1);
    expect((await baseOf(lane, LOAN_TASK))?.keptAsDraftSinceMs).toEqual(expect.any(Number));
  });

  it("on a Flow already holding work when this task first saved under it: nothing is ever applied", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt(firstAttempt);
    await lane.attempt({});
    const other = "List the loans due soonest on my library account.";
    await lane.attempt({ instruction: other, script: [readLoans(), complete("Listed.")] });
    expect(await baseOf(lane, other)).toEqual({ flowId: FLOW, keptAsDraftSinceMs: expect.any(Number) });
    const standing = await flowAsItStands(lane);
    const second = await lane.attempt({ instruction: other });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(await flowAsItStands(lane)).toBe(standing);
    expect(await changesOn(lane)).toHaveLength(1);
  });
});

describe("nothing is applied", () => {
  it("for a run judged no, or an attempt with any model decision", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt(firstAttempt);
    const judged = await lane.attempt({ judge: [judgedNo("Not what was asked.")], script: [readLoans("again", {}), complete("Listed by hand.")] });
    expect(judged.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    expect(await changesOn(lane)).toEqual([]);
    lane.target.page = "elsewhere";
    const broke = await lane.attempt({ script: [readLoans("again", {}), complete("Listed by hand.")] });
    expect(broke.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    expect(await changesOn(lane)).toEqual([]);
    expect(await stepsInTheFlow(lane)).toEqual([]);
  });

  it("for a repair, until its own next whole run proves it, which then replaces this task's earlier apply", async () => {
    const made = await appliedLane(cleanups);
    const { lane, target } = made;
    await lane.attempt(honestFirstAttempt());
    await lane.attempt(pressedAgain);
    const earlier = (await graphOf(lane))!;
    expect(earlier.nodes.length).toBeGreaterThan(0);
    made.site.loanControl = LENGTHEN;
    const third = await lane.attempt({ ...repaired(), runAgain: true });
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_repair" });
    expect(await changesOn(lane)).toHaveLength(1);
    expect((await graphOf(lane))?.nodes.find((node) => node.definitionId === RENEW_LOAN)?.parameterValues).not.toMatchObject({ control: LENGTHEN });

    const fourth = await lane.attempt(pressedAgain);
    expect(fourth.decisions).toHaveLength(0);
    expect(fourth.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 4 });
    expect(target.library.renewals).toEqual(onceEach(TITLES, 4));
    const changes = await changesOn(lane);
    expect(changes.map((change) => change.status)).toEqual(["applied", "applied"]);
    expect(changes.find((change) => change.mode === "extend")?.application?.appliedBy).toBe("runtime");
    const now = (await graphOf(lane))!;
    expect(now.flowId).toBe(earlier.flowId);
    expect(now.nodes.find((node) => node.definitionId === RENEW_LOAN)?.parameterValues).toMatchObject({ control: LENGTHEN });
    expect((await baseOf(lane, LOAN_TASK))?.digest).toBe(await lane.service.getLlmExecutionDependencyDigest(lane.projectId, FLOW));

    const fifth = await lane.attempt(again);
    expect(fifth.decisions).toHaveLength(0);
    expect(fifth.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 5 });
    expect(await changesOn(lane)).toHaveLength(2);
  });
});

describe("when applying goes wrong", () => {
  it("a throw leaves the answer whole, says so, takes its proposal back, and is tried again on the next proven run", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt(firstAttempt);
    const review = lane.service.reviewFlowBootstrapAdaptation.bind(lane.service);
    const failing = vi.spyOn(lane.service, "reviewFlowBootstrapAdaptation").mockImplementation(async (request) => {
      if (request.action === "apply") throw new Error("The disk is full.");
      return await review(request);
    });
    const second = await lane.attempt({});
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(second.answer.result).toMatchObject({ kind: "rows", source: "flow", label: "confirmed" });
    expect(second.answer.result?.rows?.totalRows).toBeGreaterThan(0);
    expect(partNotWritten(lane.said)).toHaveLength(1);
    expect(JSON.stringify(lane.said)).not.toContain("disk is full");
    expect(await stepsInTheFlow(lane)).toEqual([]);
    expect((await changesOn(lane)).map((change) => change.status)).toEqual(["rejected"]);
    expect((await baseOf(lane))?.applied).toBeUndefined();
    expect((await baseOf(lane))?.keptAsDraftSinceMs).toBeUndefined();

    failing.mockRestore();
    const third = await lane.attempt({});
    expect(third.decisions).toHaveLength(0);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(await stepsInTheFlow(lane)).toContain(READ_LOANS);
    expect((await changesOn(lane)).map((change) => change.status).sort()).toEqual(["applied", "rejected"]);
  });

  it("a change landing while it is being applied is a person's: the path refuses it, the Flow stays a draft, and no failure is told", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt(firstAttempt);
    const review = lane.service.reviewFlowBootstrapAdaptation.bind(lane.service);
    let edited = "";
    vi.spyOn(lane.service, "reviewFlowBootstrapAdaptation").mockImplementation(async (request) => {
      if (request.action === "apply") {
        const flow = await lane.service.getFlow(lane.projectId, FLOW);
        await lane.service.saveFlow({ projectId: lane.projectId, flow: { ...flow, description: "Changed at the last moment." } });
        edited = await flowAsItStands(lane);
      }
      return await review(request);
    });
    const second = await lane.attempt({});
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(await flowAsItStands(lane)).toBe(edited);
    expect((await changesOn(lane)).map((change) => change.status)).toEqual(["rejected"]);
    expect((await baseOf(lane))?.keptAsDraftSinceMs).toEqual(expect.any(Number));
    expect(partNotWritten(lane.said)).toEqual([]);
  });

  it("a person's Stop before the proposal never loses the result, and leaves it to the next proven run", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt(firstAttempt);
    const create = lane.service.createFlowBootstrapAdaptation.bind(lane.service);
    const stopping = vi.spyOn(lane.service, "createFlowBootstrapAdaptation").mockImplementation(async (request) => {
      lane.service.buildCancellation.cancel(lane.projectId, FLOW);
      return await create(request);
    });
    const second = await lane.attempt({});
    expect(second.answer.status).toBe("answered");
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(second.answer.result?.rows?.totalRows).toBeGreaterThan(0);
    expect(partNotWritten(lane.said)).toEqual([]);
    expect(await stepsInTheFlow(lane)).toEqual([]);
    expect(await changesOn(lane)).toEqual([]);
    stopping.mockRestore();
    await lane.attempt({});
    expect(await stepsInTheFlow(lane)).toContain(READ_LOANS);
  });

  it("a person's Stop during the apply never loses the result, and what it finished stands", async () => {
    const { lane } = await appliedLane(cleanups);
    await lane.attempt(firstAttempt);
    const review = lane.service.reviewFlowBootstrapAdaptation.bind(lane.service);
    vi.spyOn(lane.service, "reviewFlowBootstrapAdaptation").mockImplementation(async (request) => {
      if (request.action === "apply") lane.service.buildCancellation.cancel(lane.projectId, FLOW);
      return await review(request);
    });
    const second = await lane.attempt({});
    expect(second.answer.status).toBe("answered");
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(second.answer.result?.rows?.totalRows).toBeGreaterThan(0);
    expect(partNotWritten(lane.said)).toEqual([]);
    expect((await changesOn(lane)).map((change) => change.status)).toEqual(["applied"]);
    expect((await baseOf(lane))?.digest).toBe(await lane.service.getLlmExecutionDependencyDigest(lane.projectId, FLOW));
  });
});
