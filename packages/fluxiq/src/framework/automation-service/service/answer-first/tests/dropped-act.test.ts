// @fluxiq-test-group real-sql
// A model drops steps that made landed acts (t869). The real service, the real evidence loop, the real draft and act
// record, with a scripted model: paid run `run-mw3itjcy-ce4429f7` (step 67) sent an edit under the wrong outer word, which
// used to be refused and is now put right and applied (`S/runtime/llm/anthropic/task-answer.ts`), so it has to be noticed.
// A lending library is none of the Lab's realistic scenarios: the same press node opens a page and renews a loan, as a real
// domain's one click node presses every kind of control, and each call says the page it found the target on.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnthropicTaskAnswer } from "../../../../../runtime/llm/anthropic/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult, AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstSavedStateOf } from "../index.ts";
import { judgedNo } from "./endings/support.ts";
import { complete, RENEW_LOAN, runNode, scriptedAttempt, type FakeLibraryFault } from "./fake-library.ts";
import { LOAN_STEP, LOAN_TASK, onceEach, PERMITTED, READ_STEP } from "./honest-attempts.ts";
import { readLoans } from "./later-attempts.ts";
import { ATLAS, BIRDS, CLOCKS, DUNES, pressLoanByHand, siteLane, TITLES } from "./library-site.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

type DraftLine = { step: number; disposition: string; inResult: boolean; landed?: boolean };
type DraftEntry = { steps: DraftLine[]; instruction: string };

const draftOf = (request: AutomationStudioLlmTaskRequest): DraftEntry => request.context.evidenceLoop!.evidence.find((entry) => entry.toolId === "core.flow_draft")!.value as DraftEntry;
const landedIn = (entry: DraftEntry): number[] => entry.steps.filter((line) => line.landed).map((line) => line.step);
const stepsInFlow = (entry: DraftEntry): number[] => entry.steps.filter((line) => line.inResult).map((line) => line.step);
const lastingProposed = (steps: readonly { disposition: string; position: number }[]): number[] => steps.filter((step) => step.disposition === "kept").map((step) => step.position);
const drop = (...steps: number[]): JsonObject => ({ kind: "amend_draft", amendments: steps.map((step) => ({ step, change: "drop" })) });
const keep = (...steps: number[]): JsonObject => ({ kind: "amend_draft", amendments: steps.map((step) => ({ step, change: "keep" })) });

/** Keeps what each decision was shown, since an assertion thrown inside a script reads as the model's call failing, and the rounds would go on. */
const shownTo = () => {
  const shown: AutomationStudioLlmTaskRequest[] = [];
  return {
    shown,
    then: (next: JsonObject) => (request: AutomationStudioLlmTaskRequest): JsonObject => {
      shown.push(request);
      return next;
    }
  };
};

/** One press node for every kind of control, as a real domain's click is: `title` says what it presses, and each call says the page it found the target on. */
const sitePages = (): { page: string; fault: FakeLibraryFault } => {
  const site = {
    page: "account",
    fault: ({ toolId, value }: { toolId: string; value: JsonObject }, library: { renewals: Record<string, number> }): AutomationStudioLlmEvidenceToolExecutionResult | undefined => {
      if (toolId !== "core.run_node" || value.node !== RENEW_LOAN) return undefined;
      const parameters = value.parameters as { title: string };
      const from = site.page;
      const [word, what] = parameters.title.split(":") as [string, string];
      if (word === "open") site.page = what.split("#")[0]!;
      else library.renewals[what] = (library.renewals[what] ?? 0) + 1;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, pageChanged: true, page: site.page }, effectApplied: true, draft: { actionId: RENEW_LOAN, input: value, ranWith: { node: RENEW_LOAN, parameters, consequences: value.consequences ?? [] }, replay: { from: { location: `library://${from}` } }, proposes: true, effect: "mutate" } };
    }
  };
  return site;
};

const open = (callId: string, where: string): JsonObject => runNode(callId, RENEW_LOAN, { title: `open:${where}` }, [], { add: true });
const renew = (callId: string, title: string, over: JsonObject = { add: true }): JsonObject => runNode(callId, RENEW_LOAN, { title: `renew:${title}` }, ["modify_existing"], over);

const PAID_SHAPE_TASK = "Renew my three library loans.";
/** The paid reply's shape, word for word but for what it says: the edit's own word on the wrapper, and on the decision inside it. */
const paidReply = (amendments: readonly number[]): JsonObject => ({
  kind: "amend_draft",
  summary: "Two renewals were wrong, so I am dropping them from the Flow and will do the right ones next.",
  decision: { kind: "amend_draft", amendments: amendments.map((step) => ({ step, change: "drop" })) }
});
const USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 };

describe("the paid reply's edit, through the whole evidence loop", () => {
  it("is put right and applied: the way-to-a-page guard puts the navigations back, the renewals leave the Flow, and the draft says so on every decision", async () => {
    const site = sitePages();
    const told = shownTo();
    const repaired: JsonObject[] = [];
    const STEPS = { openFirst: 2, renewFirst: 3, openSecond: 4, renewSecond: 5, openThird: 6, list: 7, openThirdAgain: 8, renewThird: 9, openDone: 10 };
    const attempted = await scriptedAttempt({
      instruction: PAID_SHAPE_TASK, ...PERMITTED, fault: site.fault,
      script: [
        open("o1", ATLAS), renew("r1", ATLAS),
        open("o2", BIRDS), renew("r2", BIRDS),
        open("o3", CLOCKS), open("back", "list"), open("o3b", `${CLOCKS}#again`), renew("r3", CLOCKS),
        open("done", "done"),
        // The same reply step 67 sent, through Anthropic's own reading of it, and into the loop as what it comes to.
        (request) => {
          const answer = automationStudioAnthropicTaskAnswer(paidReply([STEPS.openSecond, STEPS.renewSecond, STEPS.openThird, STEPS.openThirdAgain, STEPS.renewThird]), request, USAGE, 200) as unknown as { kind: string; decision: JsonObject };
          repaired.push(answer as unknown as JsonObject);
          return answer.decision;
        },
        told.then(complete("Renewed all three."))
      ]
    }, cleanups);

    expect(repaired[0]).toMatchObject({ kind: "evidence_tool_decision", decision: { kind: "amend_draft" } });
    const { answered } = attempted;
    if (answered.status !== "answered") throw new Error(`expected an answer, got ${answered.status}`);
    expect(answered.attempt).toMatchObject({ status: "achieved" });
    // Nothing un-happened: each renewal landed once, and all three stay on the result.
    expect(attempted.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1, [CLOCKS]: 1 });
    expect(answered.result?.acts.filter((act) => act.state === "landed")).toHaveLength(3);

    const draft = draftOf(told.shown[0]!);
    // What the guard does: it holds each step's way to its page, so the moves that strand a kept step come back, and it knows nothing of acts.
    expect(stepsInFlow(draft)).toEqual([STEPS.openFirst, STEPS.renewFirst, STEPS.openSecond, STEPS.openThird, STEPS.list, STEPS.openDone]);
    const toldBeside = JSON.stringify(told.shown[0]!.context.evidenceLoop!.evidence.filter((entry) => entry.toolId !== "core.flow_draft"));
    expect(toldBeside).toContain("strands_a_step");
    expect(toldBeside).toContain("unreached");
    // What is new: the steps that made a lasting act and left the Flow are said to, and a move that left it is not.
    expect(landedIn(draft)).toEqual([STEPS.renewSecond, STEPS.renewThird]);
    expect(draft.instruction).toContain("Leaving it out undoes nothing");
    expect(draft.instruction).toContain("a later run will not do it");
    expect(draft.instruction).toContain("put the step back");
    // Generic words: nothing of this library's reaches them.
    expect(draft.instruction).not.toMatch(/loan|renew|library/iu);
  });

  it("holds the whole decision schema fixed across a round, on the real path", async () => {
    const site = sitePages();
    const attempted = await scriptedAttempt({
      instruction: PAID_SHAPE_TASK, ...PERMITTED, fault: site.fault,
      script: [open("o1", ATLAS), renew("r1", ATLAS), drop(3), keep(3), complete("Renewed it.")]
    }, cleanups);
    const decisions = attempted.requests.filter((request) => request.taskKind === "evidence_tool_decision" && request.metadata?.source !== "instructionAuthority");
    expect(decisions.length).toBeGreaterThanOrEqual(5);
    const schemas = decisions.map((request) => JSON.stringify(request.context.evidenceLoop!.decisionSchema));
    // Amending is in the head from the first decision, before any step can be amended: that is what the recovery fix leaves to a loop that declares a draft.
    expect(schemas.every((schema) => schema.includes('"const":"amend_draft"'))).toBe(true);
    // This fake's look comes on offer after the first press, as no web tool does: two paid runs sent one head across all of their 37 and 32 decisions.
    expect(new Set(schemas.slice(1)).size).toBe(1);
  });
});

describe("a model that drops a step that made a landed act", () => {
  const FLOW_OF_TWO = { instruction: LOAN_TASK, ...PERMITTED };
  const PRESS_ATLAS = LOAN_STEP;
  const PRESS_BIRDS = LOAN_STEP + 1;
  const asked = () => [readLoans(), pressLoanByHand("first", ATLAS), pressLoanByHand("second", BIRDS)];

  it("is told, can put it back with nothing pressed, and the saved Flow holds what the draft held", async () => {
    const { lane, target } = await siteLane(cleanups);
    const told = shownTo();
    const first = await lane.attempt({ ...FLOW_OF_TWO, script: [...asked(), drop(PRESS_BIRDS), told.then(keep(PRESS_BIRDS)), told.then(complete("Renewed the two."))] });
    expect(first.answer.attempt.status).toBe("achieved");
    expect(landedIn(draftOf(told.shown[0]!))).toEqual([PRESS_BIRDS]);
    expect(stepsInFlow(draftOf(told.shown[0]!))).not.toContain(PRESS_BIRDS);
    // Put back: in the Flow, no mark, nothing said, and pressed no more than it was.
    expect(landedIn(draftOf(told.shown[1]!))).toEqual([]);
    expect(stepsInFlow(draftOf(told.shown[1]!))).toContain(PRESS_BIRDS);
    expect(draftOf(told.shown[1]!).instruction).not.toContain("Leaving it out undoes nothing");
    expect(target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });
    expect(lastingProposed((await lane.kept(LOAN_TASK))?.best?.steps ?? [])).toEqual([READ_STEP, PRESS_ATLAS, PRESS_BIRDS]);
  });

  it("completes all the same, and the saved Flow lacks the step while the record keeps the act", async () => {
    const { lane, target } = await siteLane(cleanups);
    const first = await lane.attempt({ ...FLOW_OF_TWO, script: [...asked(), drop(PRESS_BIRDS), complete("Renewed the two.")] });
    expect(first.answer.attempt.status).toBe("achieved");
    expect(first.answer.result?.acts.map((act) => act.state)).toEqual(["landed", "landed"]);
    expect(target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });
    const kept = await lane.kept(LOAN_TASK);
    // The saved steps keep the one that left, marked out of the Flow: a later attempt's draft says the same of it.
    expect(kept?.best?.steps.map((step) => [step.position, step.disposition])).toEqual([[1, "taken"], [READ_STEP, "kept"], [PRESS_ATLAS, "kept"], [PRESS_BIRDS, "dropped"]]);
    expect(lastingProposed(kept?.best?.steps ?? [])).toEqual([READ_STEP, PRESS_ATLAS]);
    // It is a first attempt, and never ran whole.
    expect(automationStudioAnswerFirstSavedStateOf(kept)).toMatchObject({ state: "partly_works", trust: "unproven" });
  });

  it("a further ask after that: the Flow does not press the step it lacks, the judge's no brings the model back, it is told of the step again, and a press by hand is the further ask's own", async () => {
    const { lane, target } = await siteLane(cleanups);
    await lane.attempt({ ...FLOW_OF_TWO, script: [...asked(), drop(PRESS_BIRDS), complete("Renewed the two.")] });
    const told = shownTo();
    const second = await lane.attempt({
      ...FLOW_OF_TWO, judge: [judgedNo("One renewal asked for did not happen on this run.")],
      script: [told.then(pressLoanByHand("by-hand", BIRDS)), complete("Renewed the two again.")]
    });
    expect(second.answer.attempt.status).toBe("achieved");
    // The engine's run: the one press the Flow holds, and never the one it lacks.
    expect(target.presses.map((one) => one.subject)).toEqual([ATLAS]);
    expect(second.answer.attempt.path).toMatch(/^run_flow_then_/u);
    expect(landedIn(draftOf(told.shown[0]!))).toEqual([PRESS_BIRDS]);
    // This is a new ask, so the press by hand is not the first attempt's act again: it lands, and the Flow holds it from here.
    expect(target.library.renewals).toEqual({ [ATLAS]: 2, [BIRDS]: 2 });
    const third = await lane.attempt({ ...FLOW_OF_TWO });
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(target.presses.slice(1).map((one) => one.subject)).toEqual([ATLAS, BIRDS]);
  });

  it("an attempt that ran out of budget: the next one does not press the act again, by the Flow or by hand, since the record says it is done", async () => {
    const { lane, target } = await siteLane(cleanups);
    const first = await lane.attempt({ ...FLOW_OF_TWO, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.2, keepLooking: true, script: [...asked(), drop(PRESS_BIRDS)] });
    expect(first.answer.attempt.status).toBe("budget_out");
    expect(target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });

    const told = shownTo();
    const second = await lane.attempt({ ...FLOW_OF_TWO, judge: [judgedNo("Two renewals asked for are not done.")], script: [told.then(pressLoanByHand("again", BIRDS)), told.then(pressLoanByHand("others", CLOCKS)), pressLoanByHand("last", DUNES), complete("Renewed all four.")] });
    expect(second.answer.attempt.status).toBe("achieved");
    // The Flow held the press of the first, which the record said was done, and lacked the second: neither happened again.
    expect(target.presses).toEqual([]);
    expect(target.library.renewals).toEqual({ ...onceEach(TITLES) });
    // The press by hand was answered as done: it is told, not refused as a failure.
    const answered = JSON.stringify(told.shown[1]!.context.evidenceLoop!.evidence);
    expect(answered).toContain("attempt.act_already_done");
  });

  it("a model that insists: the same drop again is told it is already out, costs no press and never ends the task", async () => {
    const { lane, target } = await siteLane(cleanups);
    const again = drop(PRESS_BIRDS);
    const first = await lane.attempt({ ...FLOW_OF_TWO, script: [...asked(), again, again, again, again, again, complete("Renewed the two.")] });
    expect(first.answer.attempt.status).toBe("achieved");
    expect(target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });
    expect(first.answer.result?.acts).toHaveLength(2);
    expect(lastingProposed((await lane.kept(LOAN_TASK))?.best?.steps ?? [])).toEqual([READ_STEP, PRESS_ATLAS]);
  });
});
