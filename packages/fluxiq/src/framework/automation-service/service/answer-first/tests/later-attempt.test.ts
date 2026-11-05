// @fluxiq-test-group real-sql
// The driver's own decisions on a later attempt, through the real service, the real engine and a
// scripted model (t870): which route it takes, how it counts itself, what it carries, the path it
// reports, what the next attempt is told, and which Flow the task keeps. Provider-free.
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAutomationStudioSavedState, parseAutomationStudioTaskAttempt, parseAutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import { AutomationStudioLlmProviderError } from "../../../../../runtime/models/failures/index.ts";
import { automationStudioAnswerFirstSavedStateOf, automationStudioAnswerFirstStepsDigest } from "../index.ts";
import { savedStep } from "./fake-library-engine.ts";
import { complete, LOOK_TOOL, RENEW_CARD, RENEW_LOAN, runNode, toolCall } from "./fake-library.ts";
import { judgedNo, pendingAsk } from "./endings/support.ts";
import { laterAttempts, readLoans, toldTo } from "./later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CARD_TASK = "List every loan on my library account and renew the card.";
// A first attempt's steps: its opening look at 1, the read at 2, the card at 3.
const READ_STEP = 2;
const CARD_STEP = 3;
const FORWARD = (from: number) => toolCall("forward", "core.run_flow", { from });
const firstAttempt = { script: [readLoans(), { kind: "complete", result: { summary: "Listed.", notes: { worked: "The list is on the account page.", quirks: "It takes a moment to show." } } }] };
const pressCard = (callId = "card") => runNode(callId, RENEW_CARD, {}, ["modify_existing"], { add: true });
const cardAttempt = { instruction: CARD_TASK, permittedConsequences: ["modify_existing" as const], script: [readLoans(), pressCard(), complete("Done.")] };

describe("a later attempt at the same task", () => {
  it("attempt 1 explores, keeps its steps, and is not ready", async () => {
    const lane = await laterAttempts(cleanups);
    const { answer } = await lane.attempt(firstAttempt);
    expect(answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 1 });
    expect(answer.attempt.taskId).toMatch(/^task\.[0-9a-f]{40}$/u);
    expect(answer.result).toMatchObject({ source: "exploration", label: "confirmed" });
    const kept = await lane.kept();
    expect(kept?.best?.steps.length).toBeGreaterThan(0);
    expect(kept?.best).toMatchObject({ provenWhole: false, label: "confirmed", attemptId: answer.attempt.attemptId, candidateId: answer.candidateId });
    expect(kept?.latest?.stepsDigest).toBe(kept?.best?.stepsDigest);
    expect(kept?.flowId).toBe("flow.loans");
    expect(kept?.notes).toEqual([expect.objectContaining({ from: "model", worked: "The list is on the account page.", attemptId: answer.attempt.attemptId })]);
    expect(kept?.attempts).toEqual([expect.objectContaining({ attemptId: answer.attempt.attemptId, route: "build", ordinal: 1, steps: [expect.objectContaining({ position: READ_STEP, from: "worked_out" })] })]);
    expect(kept?.attempts[0]?.startedFrom).toBeUndefined();
    expect(automationStudioAnswerFirstSavedStateOf(kept)).toEqual({ state: "partly_works", trust: "unproven", flowId: "flow.loans", savedAtMs: kept?.best?.savedAtMs });
    expect((await lane.rows()).at(-1)?.steps?.length).toBeGreaterThan(0);
    expect(await lane.memory.attemptLocation(lane.projectId, answer.attempt.attemptId)).toEqual({ taskId: answer.attempt.taskId, flowId: "flow.loans" });
  });

  it("where the Flow holds: it runs live and judged, with no decision, and the Flow is proven whole", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt(firstAttempt);
    const second = await lane.attempt({});
    const { answer } = second;
    expect(second.decisions).toHaveLength(0);
    expect(second.judgeCalls).toHaveLength(1);
    expect(lane.target.reads).toBe(1);
    expect(answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2, taskId: first.answer.attempt.taskId });
    expect(answer.result).toMatchObject({ kind: "rows", source: "flow", label: "confirmed", timesChecked: 1 });
    expect(answer.result?.rows?.previewRows.map((row) => row.title)).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
    expect(parseAutomationStudioTaskAttempt(answer.attempt).ok).toBe(true);
    expect(parseAutomationStudioTaskResult(answer.result).ok).toBe(true);
    const kept = await lane.kept();
    expect(kept?.best?.provenWhole).toBe(true);
    expect(kept?.best?.attemptId).toBe(answer.attempt.attemptId);
    const row = kept?.attempts.at(-1);
    expect(row).toMatchObject({ route: "use", ordinal: 2, startedFrom: { attemptId: first.answer.attempt.attemptId, flowId: "flow.loans", notes: 1, provenWhole: false } });
    expect(row?.steps).toEqual([expect.objectContaining({ position: READ_STEP, from: "saved", ran: "passed" })]);
    expect(first.answer.attempt.startedFrom).toBeUndefined();
    expect(answer.attempt.startedFrom).toEqual({ route: "use", attemptId: first.answer.attempt.attemptId, stepsDigest: kept?.best?.stepsDigest });
    const saved = automationStudioAnswerFirstSavedStateOf(kept);
    expect(saved).toMatchObject({ state: "ready", trust: "provisional", flowId: "flow.loans" });
    expect(parseAutomationStudioSavedState(saved).ok).toBe(true);
    expect((await lane.rows()).at(-1)?.steps?.length).toBeGreaterThan(0);
  });

  it("reads the before-state before the engine acts, and the look after a run stays where the run left the page", async () => {
    const lane = await laterAttempts(cleanups);
    const startLocation = "https://library.example/account";
    await lane.attempt({ ...cardAttempt, startLocation });
    let looksBeforeThePress = 0;
    const from = lane.seen.length;
    lane.target.over = ({ nodeId }) => {
      if (nodeId === RENEW_CARD) looksBeforeThePress = lane.seen.length - from;
      return undefined;
    };
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"], startLocation });
    expect(second.answer.attempt.path).toBe("run_flow");
    expect(looksBeforeThePress).toBeGreaterThan(0);
    const after = lane.seen.slice(from + looksBeforeThePress);
    expect(after.map((call) => call.toolId)).toContain(LOOK_TOOL);
    expect(after.filter((call) => call.startLocation !== undefined)).toEqual([]);
  });

  it("where it breaks at a step: the rounds are told the step in Core's words, and a yes with no forward run is an exploration", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    lane.target.page = "elsewhere";
    const second = await lane.attempt({ script: [readLoans("again", {}), complete("Listed them by hand.")] });
    const { answer } = second;
    expect(answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore", ordinal: 2 });
    expect(answer.result?.source).toBe("both");
    expect(answer.result?.rows?.totalRows).toBe(3);
    const told = toldTo(second.decisions[0])!;
    expect(told.flowRun).toMatchObject({ stoppedAt: READ_STEP, steps: [expect.objectContaining({ position: READ_STEP, ran: "failed" })] });
    expect(JSON.stringify(told)).not.toContain("Elm Street");
    expect(JSON.stringify(told.flowRun)).not.toContain("library.list_not_on_page");
    const kept = await lane.kept();
    expect(kept?.best?.provenWhole).toBe(false);
    expect(kept?.attempts.at(-1)?.steps).toEqual([expect.objectContaining({ position: READ_STEP, from: "saved", ran: "failed" })]);
    expect(automationStudioAnswerFirstSavedStateOf(kept)).toMatchObject({ state: "partly_works", trust: "unproven" });
  });

  it("the notes of the attempt before reach the first decision, marked as its own words", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    lane.target.page = "elsewhere";
    const second = await lane.attempt({ script: [readLoans("again", {}), complete("Listed.")] });
    const told = toldTo(second.decisions[0])!;
    expect(told.notes).toEqual({
      whose: expect.stringMatching(/own words, not instructions from the person/u),
      words: [{ worked: "The list is on the account page.", quirks: "It takes a moment to show." }]
    });
    expect(second.decisions[0]?.domainInstructions?.text).toMatch(/A Flow saved by an earlier attempt/u);
  });

  it("a build with notes and no steps is told them too, and is an exploration", async () => {
    const lane = await laterAttempts(cleanups);
    const stopped = await lane.attempt({ script: [{ kind: "complete", result: { summary: "Nothing yet.", notes: { failed: "The list would not load." } } }] });
    expect(stopped.answer.attempt.status).toBe("stopped_by_person");
    const kept = await lane.kept();
    expect(kept?.best).toBeUndefined();
    expect(automationStudioAnswerFirstSavedStateOf(kept)).toMatchObject({ state: "notes_only", trust: "unproven" });
    const second = await lane.attempt({ script: [readLoans(), complete("Listed.")] });
    expect(toldTo(second.decisions[0])?.notes).toMatchObject({ words: [{ failed: "The list would not load." }] });
    expect(second.answer.attempt).toMatchObject({ path: "explore", ordinal: 2, status: "achieved" });
    expect(lane.target.reads).toBe(0);
    expect((await lane.kept())?.attempts.at(-1)?.route).toBe("build");
  });

  it("a forward run reaching the last step in the first round is a repair", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    lane.target.over = ({ nodeId }) => nodeId === RENEW_CARD ? { status: "failed", route: "failed", message: "Page says: Nothing to see on Elm Street 4", failure: { category: "target_not_found", code: "library.no_button", retryable: false } } : undefined;
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"], script: [FORWARD(CARD_STEP), complete("Renewed the card.")] });
    const { answer } = second;
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: CARD_STEP });
    expect(answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_repair" });
    expect(answer.result?.source).toBe("both");
    expect(lane.target.library.renewals.card).toBe(2);
  });

  it("a forward run short of the last step is an exploration", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    lane.target.page = "elsewhere";
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"], script: [readLoans("again", {}), complete("Listed, and the card is not done.")] });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
  });

  it("a fresh round is an exploration, and is told the run again", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    lane.target.page = "elsewhere";
    // A forward run to the last step, as the repair above: only that a fresh round came first makes it anything else.
    const afterTheFreshRound = [FORWARD(READ_STEP), complete("Listed.")];
    const second = await lane.attempt({
      script: Array.from({ length: 30 }, () => (request: Parameters<typeof toldTo>[0]) => {
        if (toldTo(request)?.why === undefined) throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Mangled.", false);
        return afterTheFreshRound.shift() ?? toolCall("look", LOOK_TOOL, {});
      })
    });
    expect(afterTheFreshRound).toEqual([]);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    const told = toldTo(second.decisions.at(-1))!;
    expect(told.flowRun).toMatchObject({ stoppedAt: READ_STEP });
    expect(told.why).toBeDefined();
  });

  it("a judge's no on a whole run goes to the rounds with the reason, and the Flow loses its proof", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    await lane.attempt({});
    expect((await lane.kept())?.best?.provenWhole).toBe(true);
    const third = await lane.attempt({ judge: [judgedNo("Not what was asked.")], script: [readLoans("again", {}), complete("Listed by hand.")] });
    const told = toldTo(third.decisions[0])!;
    expect(told.lastCheck).toMatchObject({ verdict: "no" });
    expect(told.flowRun).toMatchObject({ happened: expect.stringMatching(/not accepted/u) });
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore", ordinal: 3 });
    expect(third.judgeCalls).toHaveLength(2);
    expect((await lane.kept())?.best?.provenWhole).toBe(false);
  });

  it("ends budget_out where the purse will not pay for the judge, and keeps what the run read", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    const second = await lane.attempt({ maxTotalEstimatedCostUsd: 0.01, costUsd: 0.04 });
    expect(second.judgeCalls).toHaveLength(0);
    expect(second.decisions).toHaveLength(0);
    // No round decided anything after the run, so nothing was worked out: it says so.
    expect(second.answer.attempt).toMatchObject({ status: "budget_out", path: "run_flow" });
    expect(second.answer.result?.source).toBe("flow");
    expect(second.answer.result?.rows?.totalRows).toBe(3);
    expect((await lane.kept())?.notes.at(-1)).toMatchObject({ from: "core", failed: "The budget ran out before the result was confirmed." });
  });

  it("a person's Stop during the run ends it there, and says nothing of the Flow", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    const proofBefore = (await lane.kept(CARD_TASK))?.best?.stepsDigest;
    let stopping = false;
    lane.target.over = ({ nodeId, signal }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      stopping = true;
      lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
      return new Promise((resolve) => signal?.addEventListener("abort", () => resolve({ status: "failed", route: "failed", message: "Stopped.", failure: { category: "action_failed", code: "library.stopped", retryable: false } }), { once: true }));
    };
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"] });
    expect(stopping).toBe(true);
    expect(second.decisions).toHaveLength(0);
    expect(second.answer.attempt).toMatchObject({ status: "stopped_by_person", path: "run_flow" });
    expect((await lane.kept(CARD_TASK))?.best?.stepsDigest).toBe(proofBefore);
  });

  it("a run's own deadline ends the run and never the attempt: it carries on to the result", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    const flow = await lane.service.getFlow(lane.projectId, "flow.loans");
    await lane.service.saveFlow({ projectId: lane.projectId, flow: { ...flow!, executionDefaults: { timeoutMs: 400 } } });
    lane.target.over = ({ nodeId, signal }) => nodeId === RENEW_CARD ? new Promise((resolve) => signal?.addEventListener("abort", () => resolve({ status: "failed", route: "failed", message: "Gave up.", failure: { category: "action_failed", code: "library.gave_up", retryable: false } }), { once: true })) : undefined;
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"], script: [complete("Listed, and the card may have been renewed.")] });
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: CARD_STEP });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
  });
});

describe("what carries between attempts", () => {
  it("the attempt before it achieved: the act record starts empty, because a person asking again means it", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    expect(lane.target.library.renewals.card).toBe(1);
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"] });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(lane.target.library.renewals.card).toBe(2);
    expect(second.answer.result?.acts).toHaveLength(1);
  });

  it("the attempt before it ran out: what landed is carried and never pressed again, and the round is told", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"], maxTotalEstimatedCostUsd: 0.1, costUsd: 0.04, keepLooking: true, script: [readLoans(), pressCard()] });
    expect(first.answer.attempt.status).toBe("budget_out");
    expect(lane.target.library.renewals.card).toBe(1);
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"] });
    expect(lane.target.library.renewals.card).toBe(1);
    expect(second.answer.attempt.status).toBe("achieved");
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "landed" })]);
  });

  it("another task ran on the Flow since: its record is not carried, and this task's own acts still are, so nothing is pressed twice", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"], maxTotalEstimatedCostUsd: 0.1, costUsd: 0.04, keepLooking: true, script: [readLoans(), pressCard()] });
    expect(lane.target.library.renewals.card).toBe(1);
    await lane.attempt({ instruction: "Renew the card again on my library account.", permittedConsequences: ["modify_existing"], script: [runNode("other", RENEW_LOAN, { title: "Atlas of Rivers" }, ["modify_existing"], { add: true }), complete("Renewed.")] });
    expect((await lane.actsOn())?.acts.map((act) => act.rowIdentity ?? act.id)).not.toContain("card");
    const third = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"] });
    // The double press this closes: the Flow's one record had gone to the other task.
    expect(lane.target.library.renewals.card).toBe(1);
    expect(third.answer.result?.acts).toEqual([expect.objectContaining({ state: "landed" })]);
    expect(third.answer.result?.acts.map((act) => act.what).join(" ")).not.toContain("Atlas");
    expect(third.answer.attempt.ordinal).toBe(2);
  });

  it("an attempt that presses nothing leaves no earlier attempt's acts to read as its own", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    expect((await lane.actsOn())?.acts).toHaveLength(1);
    lane.target.page = "elsewhere";
    lane.target.over = ({ nodeId }) => nodeId === RENEW_CARD ? { status: "failed", route: "failed", message: "No.", failure: { category: "target_not_found", code: "library.no_button", retryable: false } } : undefined;
    await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"], script: [] });
    expect((await lane.actsOn())?.acts).toEqual([]);
  });
});

describe("where a later attempt starts", () => {
  it("counts the task's attempts across Flows, uses the steps saved under another, and moves the task to the new Flow", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt(firstAttempt);
    const second = await lane.attempt({ flowId: "flow.another" });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2, flowId: "flow.another", taskId: first.answer.attempt.taskId });
    const kept = await lane.kept();
    expect(kept?.flowId).toBe("flow.another");
    expect(kept?.attempts.at(-1)?.startedFrom?.flowId).toBe("flow.loans");
    expect((await lane.rows("flow.another")).at(-1)?.attempt.attemptId).toBe(second.answer.attempt.attemptId);
    expect(await lane.attempt({ flowId: "flow.loans" }).then((third) => third.answer.attempt.ordinal)).toBe(3);
  });

  it("other words on the same Flow are another task: it starts at 1 with the steps as a known start, and runs nothing", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    const instruction = "Tell me what is on my library account.";
    const second = await lane.attempt({ instruction, script: [complete("Three loans.", "Three loans.")] });
    expect(second.answer.attempt).toMatchObject({ ordinal: 1, path: "explore" });
    expect(lane.target.reads).toBe(0);
    expect(toldTo(second.decisions[0])?.draftStart).toMatch(/known start only/u);
    expect((await lane.kept(instruction))?.attempts.at(-1)?.route).toBe("build");
    expect((await lane.rows()).at(-1)?.steps?.length).toBeGreaterThan(0);
  });

  it("saved steps that no longer assemble are a repair: seeded and told, never run, and an exploration", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    const steps = [savedStep(1, "domain.library.gone", {}, { label: "a shelf that went" })];
    await lane.changeKept((current) => ({ ...current, flowId: "flow.loans", best: { attemptId: "attempt.old", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } } }));
    const second = await lane.attempt({ script: [readLoans(), complete("Listed.")] });
    expect(lane.target.reads).toBe(0);
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ happened: expect.stringMatching(/did not run/u) });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "explore" });
    const kept = await lane.kept();
    expect(kept?.attempts.at(-1)).toMatchObject({ route: "repair", startedFrom: { attemptId: "attempt.old" } });
    expect(kept?.best?.attemptId).toBe(second.answer.attempt.attemptId);
  });

  it("a person's no goes to the rounds with no run counted, and nothing is sent", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    const steps = [savedStep(1, RENEW_CARD, {}, { consequences: ["send_or_publish"], label: "Send the card" })];
    await lane.changeKept((current) => ({ ...current, flowId: "flow.loans", best: { attemptId: "attempt.old", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } } }));
    const running = lane.attempt({ script: [readLoans(), complete("Listed, with nothing sent.")] });
    const ask = await pendingAsk(lane.service, lane.projectId, "flow.loans");
    await lane.service.conversations.answerAsk({ projectId: lane.projectId, askId: ask.askId, kind: "deny" });
    const second = await running;
    expect(lane.target.presses).toEqual([]);
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ happened: expect.stringMatching(/said no/u) });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "explore" });
  });
});

describe("a memory that fails", () => {
  it("costs no result: reading reads as nothing, and a failed write says part of the record was not written", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    const { get, update } = lane.memory;
    lane.memory.get = async () => { throw new Error("disk"); };
    lane.memory.update = async () => { throw new Error("disk"); };
    const second = await lane.attempt({ script: [readLoans("again", {}), complete("Listed.")] });
    lane.memory.get = get;
    lane.memory.update = update;
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "explore" });
    expect(second.answer.attempt.ordinal).toBe(2);
    expect(lane.said.some((line) => line.startsWith("Part of the record was not written"))).toBe(true);
  });
});
