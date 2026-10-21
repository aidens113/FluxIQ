import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS, AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS, AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, AutomationStudioSubflowRepeatedAdvice, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/evidence-loop/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS } from "../../../llm/evidence-loop.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "./subflow-fixture.ts";

const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };
const offeredAlso = ["core.submit_candidate", "core.test_candidate", "core.run_flow", "project.dispatch"].map((toolId): AutomationStudioLlmEvidenceTool => ({ toolId, description: toolId, effect: "observe", inputSchema: { type: "object" } }));

type Entry = { callId: string; toolId: string; value: unknown };

/** The most characters a tool may describe itself in (`../../../llm/evidence-loop-decision.ts`, `automationStudioLlmEvidenceValidTools`). */
const AUTOMATION_STUDIO_TOOL_DESCRIPTION_MAX = 2_000;
/** A part as long as a person's sentence of a few clauses can be, on no particular site. */
const LONG_PART = (which: string) => `For the ${which} part, open the reading room's catalogue, look through every shelf it lists for the volumes the person named in the request, note each title with its shelf mark and its loan status, and keep only the ones that are on the shelf today, leaving out any volume that is reserved, at the bindery or held in the closed stacks`;
/** The description of the submit tool's `flow` input, where the brief is (t584). */
const flowDescription = (tool: AutomationStudioLlmEvidenceTool): string => ((tool.inputSchema.properties as JsonObject).flow as JsonObject).description as string;
type Decide = Parameters<typeof runAutomationStudioSubflowBuilderLoop>[0]["loop"]["decide"];
const receiptOf = (evidence: readonly Entry[]) => {
  const value = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
  return { revision: value.revision as number, digest: value.digest as string };
};

async function build(steps: Array<(evidence: readonly Entry[]) => JsonObject>, options: { port?: boolean; callScope?: string; scope?: ReturnType<typeof testScope>; iterations?: number; toolCalls?: number; purse?: AutomationStudioLlmEvidenceLoopInput["purse"]; whole?: true } = {}) {
  const observed: AutomationStudioLlmEvidenceLoopInput[] = [];
  const executed: string[] = [];
  const offered: string[][] = [];
  const asked: AutomationStudioSubflowTrialRequest[] = [];
  let index = 0;
  const decide: Decide = async ({ evidence, tools }) => {
    offered.push(tools.map((tool) => tool.toolId));
    const step = steps[index++];
    if (!step) throw new Error("script exhausted");
    return step(evidence);
  };
  const outcome = await runAutomationStudioSubflowBuilderLoop({
    scope: options.scope ?? testScope(), siblings: [...SIBLINGS], submission: testSubmission(),
    ...(options.callScope === undefined ? {} : { callScope: options.callScope }),
    ...(options.whole ? { trialIsWhole: true as const } : {}),
    observe: (loop) => {
      observed.push(loop);
      return loop;
    },
    ...(options.port === false ? {} : { trial: { port: async (request: AutomationStudioSubflowTrialRequest) => {
      asked.push(request);
      return { partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes" as const, feedback: {}, entryPrepared: true };
    } } }),
    loop: {
      tools: [look, ...offeredAlso], maxIterations: options.iterations ?? steps.length, maxToolCalls: options.toolCalls ?? steps.length + 2,
      ...(options.purse ? { purse: options.purse } : {}),
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: async (call) => {
        executed.push(call.callId);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true };
      },
      decide
    }
  });
  return { outcome, executed, offered, asked, observed };
}

const submit = () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) });
const test = (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: receiptOf(evidence) });
const complete = (extra: JsonObject = {}) => (evidence: readonly Entry[]) => ({ kind: "complete", result: { subflowKey: "find_listing", ...receiptOf(evidence), ...extra } });

describe("a subflow builder's loop", () => {
  it("opens under its brief, offers only a builder's tools, submits, tries and completes with its subflow, revision and digest", async () => {
    const { outcome, executed, offered, asked, observed } = await build([submit, test, complete()], { callScope: "brief-1" });
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(executed[0]).toBe("initial.core.run_node.brief-1");
    expect(offered[0]).toEqual(expect.arrayContaining(["core.run_node", AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID]));
    for (const dropped of ["core.submit_candidate", "core.test_candidate", "core.run_flow", "project.dispatch"]) expect(offered[0]).not.toContain(dropped);
    expect(asked).toHaveLength(1);
    expect(outcome.proposal?.subflows.map((subflow) => subflow.key)).toEqual(["find_listing", "find_listing-narrow"]);
    expect(outcome.trial).toMatchObject({ partial: true, verdict: "yes" });
    expect(outcome.promotionAllowed).toBe(false);
    // Its wrap-up keeps its own two finishing tools running, not the whole candidate's.
    expect(observed[0]!.finishingTools).toEqual({ submit: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, test: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID });
  });

  // A8 Lab `run-mvan7giv-4246aafb` (t672): a handed-on input no line needed ended the brief blocked. It now passes, and
  // the accepted answer says so, so the builder tests and completes instead.
  it("says in the accepted answer that a handed-on input no line reads was not needed, and keeps it on the proposal", async () => {
    const scope = testScope({ interface: { inputs: [{ id: "listingPage", name: "Listing page", valueType: { kind: "unknown" } }], outputs: [] }, handedOn: ["listingPage"] });
    const unread = { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script(["flow: Find the listings", "part find_listing: find the listings", "  input: listingPage", "  step: open the listings", "    node: web.browser.navigate", "    url: https://listings.test/all", "end"]) };
    let answered: JsonObject | undefined;
    const seen = (evidence: readonly Entry[]) => {
      answered = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
      return test(evidence);
    };
    const { outcome } = await build([() => unread, seen, complete()], { scope });
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(answered).toMatchObject({ ok: true, note: expect.stringContaining("No line of this subflow reads the input \"listingPage\", which another subflow hands on: this subflow does not need it, so this revision stands as it is and the supervisor is told.") });
    expect(outcome.proposal?.unneededInputs).toEqual(["listingPage"]);
  });

  // The plan the project supervisor writes gives no success check, which makes proposing one the builder's (t569).
  it("tells the builder to propose a success check in `done when:` terms when the plan gives none, and that a plan's check is the plan's", async () => {
    const said = async (scope: ReturnType<typeof testScope>) => {
      const { observed } = await build([submit], { scope });
      return observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.description;
    };
    const routed = await said(testScope());
    expect(routed).toContain("The plan gives it no success check, so propose one with it: a `done when: <fact>` line outside every block, after its last step");
    expect(routed).toContain("It becomes this subflow's success check, and its trial is judged against it.");
    expect(routed).not.toContain("success check are the plan's");
    const part = await said(testScope({ interface: { inputs: [], outputs: [] } }));
    expect(part).toContain("inside its own `part find_listing:` block, before its first step");
    const check: NonNullable<ReturnType<typeof testScope>["successCheck"]> = [{ fact: "text", op: "contains", value: "Listings" }];
    const planned = await said(testScope({ successCheck: check }));
    expect(planned).toContain("Its success check is the plan's; leave out `done when:` for it or write exactly that.");
    expect(planned).not.toContain("propose one");
  });

  // A8 round 1: a builder wrote another subflow's part into its own, and another declared no `input:` line (t570).
  // The brief opens the description of the submit tool's `flow` input, which has no 2,000-character bound (t584).
  it("shows the builder its brief: its parts in the person's words and, for a callable subflow, the exact lines its part declares", async () => {
    const said = async (scope: ReturnType<typeof testScope>) => {
      const { observed } = await build([submit], { scope });
      const tool = observed[0]!.tools.find((offered) => offered.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!;
      expect(tool.description).toContain("The description of \"flow\" opens with your brief");
      expect(tool.description).not.toContain("Your brief is the subflow");
      return flowDescription(tool);
    };
    const routed = await said(testScope());
    expect(routed).toContain("Your brief is the subflow \"find_listing\" alone. It does only this part of the task: \"Find the listings on the listings page\" (part p1).");
    expect(routed).toContain("write its steps outside every block");
    const callable = await said(testScope({ interface: { inputs: [{ id: "listingUrl", name: "Listing URL", valueType: { kind: "unknown" } }], outputs: [{ id: "price", name: "Price", valueType: { kind: "unknown" } }] } }));
    expect(callable).toContain("it is given exactly \"listingUrl\" and hands back exactly \"price\"");
    expect(callable).toContain("part find_listing: <what it does>\n  input: listingUrl\n  output: price = $step.<label>.<output>\n");
    expect(callable).not.toContain("JSON plan");
  });

  // A8 launch 6 (t584): a read-only builder at 64 turns and a 116-call share, whose brief carried two parts in the
  // person's words, ended `llm_evidence_loop.invalid_configuration` with 0 calls: its submit tool's description had
  // outgrown the 2,000 characters a tool may describe itself in.
  it("runs a read-only builder at 64 turns and a 116-call share whose brief carries long parts", async () => {
    const parts = [
      { partId: "p1", sourceId: "instruction.1", text: LONG_PART("first") },
      { partId: "p2", sourceId: "instruction.1", text: LONG_PART("second") }
    ];
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, maxCalls: 250 });
    const carved = purse.allowance({ role: "builder", briefId: "brief-1", usd: 0.12, maxCalls: 116 });
    if (!carved.ok) throw new Error("allowance refused");
    const { outcome, executed, observed } = await build([submit, test, complete()], { scope: testScope({ predecessors: [], parts }), iterations: 64, toolCalls: 64, purse: carved.allowance });
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(executed[0]).toBe("initial.core.run_node");
    const tool = observed[0]!.tools.find((offered) => offered.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!;
    expect(flowDescription(tool)).toContain(`"${parts[0]!.text}" (part p1); "${parts[1]!.text}" (part p2)`);
  });

  it("keeps the submit tool's own description inside its bound, however long the brief", async () => {
    const parts = Array.from({ length: 6 }, (_, index) => ({ partId: `p${index + 1}`, sourceId: "instruction.1", text: LONG_PART(`part ${index + 1}`) }));
    const key = "k".repeat(64);
    const contract = { inputs: [{ id: "i".repeat(64), name: "In", valueType: { kind: "unknown" as const } }], outputs: [{ id: "o".repeat(64), name: "Out", valueType: { kind: "unknown" as const } }] };
    for (const scope of [testScope({ subflowKey: key, parts }), testScope({ subflowKey: key, parts, interface: contract })]) {
      const { observed } = await build([submit], { scope });
      const tool = observed[0]!.tools.find((offered) => offered.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!;
      expect(tool.description.length).toBeLessThanOrEqual(AUTOMATION_STUDIO_TOOL_DESCRIPTION_MAX);
      expect(flowDescription(tool)).toContain(parts[5]!.text);
    }
  });

  // A8 frozen pair 8 (t676): a builder did a later part's lasting act while it explored, and nothing named that part as another builder's.
  it("names the task's other parts as other builders' parts, and tells a dependent builder to end blocked only when a part of its own asks a lasting act", async () => {
    const said = async (scope: ReturnType<typeof testScope>) => {
      const { observed } = await build([submit], { scope });
      return flowDescription(observed[0]!.tools.find((offered) => offered.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!);
    };
    const outOfScope = [{ partId: "p2", text: "Book the earliest seat" }, { partId: "p3", text: "Write the host a note" }];
    const named = await said(testScope({ predecessors: [], outOfScope }));
    expect(named).toContain("The task's other parts are another builder's subflow: \"Book the earliest seat\" (part p2); \"Write the host a note\" (part p3).");
    expect(named).toContain("Doing one of them while you explore is allowed, but it is another builder's part: it changes where that builder's subflow starts until a reset puts the site back, and no step of this subflow does it");
    expect(named).not.toContain("Any other part of the task is another builder's subflow");
    // Without the other parts carried, the brief says only that they exist, as before.
    expect(await said(testScope({ predecessors: [] }))).toContain("Any other part of the task is another builder's subflow: write none of its steps here.");
    // A dependent brief whose parts only read is never told to end blocked: no subflow before it can do a read.
    const reading = await said(testScope());
    expect(reading).toContain("Its parts ask for no lasting act, so no subflow before it can have done one of them: build them from that page with this subflow's own steps.");
    expect(reading).not.toContain("\"ended\": \"blocked\", \"reason\": \"<which part");
    const acting = await said(testScope({ parts: [{ partId: "p1", sourceId: "instruction.1", text: "Reserve a seat for the evening talk", lastingActs: ["create_new"] }] }));
    expect(acting).toContain("a subflow before it did that part: write no step for it");
    expect(acting).toContain("\"doneBefore\": {\"part\": \"<that part's id>\", \"act\": \"<the act id the entry note lists under predecessorsLeftOnSite for it>\"}}");
    expect(acting).toContain("Only a part that asks a lasting act (\"p1\") can be done before it");
  });

  it("counts its allowance's calls in its budget, keeping its finishing trials' judges back", async () => {
    const { observed } = await build([submit]);
    expect(observed[0]!.budget).toEqual({ countCalls: { keptForFinishing: AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS } });
  });

  // t679: a single-subflow plan's test is the judged whole run; t685: its judge is paid by the builder's allowance first, so its calls are kept back.
  it("says a whole-run test is the build's judged run, and keeps back its finishing trials' judge calls as any builder does", async () => {
    let next: unknown;
    const testing = (evidence: readonly Entry[]) => {
      next = ([...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject).next;
      return test(evidence);
    };
    const { outcome, observed, offered } = await build([submit, testing, complete()], { whole: true });
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(observed[0]!.budget).toEqual({ countCalls: { keptForFinishing: AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS } });
    const testTool = observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID)!;
    expect(testTool.description).toContain("This test is the build's judged run: a yes completes this brief");
    expect(testTool.description).not.toContain("it counts for this brief only");
    expect(String(next)).toContain("This test runs the whole Flow from its start as the build's judged run; a yes completes this brief.");
    expect(offered[0]).toContain(AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID);
    // Its wrap-up and the judges it keeps back fit a brief's least calls.
    expect(AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS).toBeGreaterThanOrEqual(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS + AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS);
    // A subflow test says what it always said.
    const plain = await build([submit]);
    expect(plain.observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID)!.description).toContain("it counts for this brief only");
  });

  it("keeps the opening id exactly `initial.<toolId>` when the dispatcher passes no scope", async () => {
    const { outcome, executed, observed } = await build([submit, test, complete()]);
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(executed[0]).toBe("initial.core.run_node");
    expect(observed[0]!.callScope).toBeUndefined();
  });

  it("refuses a completion before the trial, and one naming another subflow", async () => {
    const seen: JsonObject[] = [];
    const remember = (step: (evidence: readonly Entry[]) => JsonObject) => (evidence: readonly Entry[]) => {
      seen.push(...evidence.filter((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID).map((entry) => entry.value as JsonObject));
      return step(evidence);
    };
    const { outcome } = await build([submit, remember(complete()), remember(complete({ subflowKey: "checkout" })), remember(test), complete()]);
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(JSON.stringify(seen)).toContain("subflow.trial_required");
    expect(JSON.stringify(seen)).toContain("subflow.latest_proposal_required");
  });
});

// Social rerun round 3 (`run-mvgoawg4-ed85dd5a`, 0128, 0144, 0145, 0217, 0218):
// after each no the judges advised the same change again, the builder made it
// again, and the trial after it failed the same way. A judged no's advice that
// repeats what this builder was already told after an earlier trial is now
// left out of `advice`, and `adviceRepeated` says so, with what the trial that
// followed the earlier advice answered (`../repeated-advice.ts`). The lists
// here are a library's loans, on no particular site.
const CALL_1 = "Add a due-date field to the read step.loans.s3 (the whole date, opening each row's details).";
const CALL_2 = "Keep only loans of the reading room, not the ones held at the bindery.";
const STOPPED = "Step 3 (\"read the loans\") failed and the run stopped there (web.validation.output_not_observed).";

/** A test tool's answer for a trial of `revision` that answered `verdict`, its feedback as the gate passes it on. */
function trialAnswer(revision: number, verdict: string, feedback: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict === "yes", partial: true, verdict, subflowKey: "find_listing", revision, digest: String(revision).repeat(64), entryPrepared: true, feedback, instruction: "Read the feedback." }, effectApplied: true, targetsUnchanged: false, resultCode: `subflow.trial_${verdict}` };
}
const judgedNo = (revision: number, advice: string) => trialAnswer(revision, "no", { code: "candidate.trial_judged_no", judge: { expected: "Every loan due this week.", observed: "Two loans were stored.", advice } });
const failedRun = (revision: number) => trialAnswer(revision, "execution_failed", { code: "candidate.execution_incomplete", stoppedBy: { kind: "step", step: 3, said: STOPPED } });
const judgeOf = (answered: AutomationStudioLlmEvidenceToolExecutionResult) => ((answered.evidence as JsonObject).feedback as JsonObject).judge as JsonObject;

describe("a judge's advice repeated to the same builder", () => {
  it("leaves out what an earlier trial's advice already said, keeps what is new, and says what the trial after that advice answered", () => {
    const advice = new AutomationStudioSubflowRepeatedAdvice();
    expect(advice.told(judgedNo(1, `Judge call 1: ${CALL_1} Judge call 2: ${CALL_2}`))).toEqual(judgedNo(1, `Judge call 1: ${CALL_1} Judge call 2: ${CALL_2}`));
    expect(advice.told(failedRun(2))).toEqual(failedRun(2));
    // The same words again, another step id and other case and punctuation, beside a sentence that is new.
    const told = judgeOf(advice.told(judgedNo(3, "Judge call 1: add a due-date field to the read step.loans.s7 -- the whole date, opening each row's details. Judge call 2: Sort the loans by their due date.")));
    expect(told.advice).toBe("Judge call 2: Sort the loans by their due date.");
    expect(told.adviceRepeated).toBe(`The judge repeated a sentence of the advice it gave after the trial of revision 1, which is left out of advice. The trial that followed that advice, of revision 2, answered execution_failed: ${STOPPED} Weigh the repeated advice against what that trial answered before following it again.`);
    expect(told).toMatchObject({ expected: "Every loan due this week.", observed: "Two loans were stored." });
  });

  it("says a wholly repeated advice in a note alone, naming this trial as the one that followed it when none came between", () => {
    const advice = new AutomationStudioSubflowRepeatedAdvice();
    advice.told(judgedNo(4, `${CALL_1} ${CALL_2}`));
    const told = judgeOf(advice.told(judgedNo(5, `${CALL_2} ${CALL_1}`)));
    expect("advice" in told).toBe(false);
    expect(told.adviceRepeated).toBe("The judge repeated 2 sentences of the advice it gave after the trial of revision 4, which are left out of advice. This trial, of revision 5, is the next trial after that advice, and it was judged no again. Weigh the repeated advice against what that trial answered before following it again.");
  });

  it("keeps advice that differs in a number or in more than a word in five, the first advice, and every other verdict as they were", () => {
    const advice = new AutomationStudioSubflowRepeatedAdvice();
    advice.told(judgedNo(1, "Keep only loans due on or after 19 March."));
    expect(advice.told(judgedNo(2, "Keep only loans due on or after 20 March."))).toEqual(judgedNo(2, "Keep only loans due on or after 20 March."));
    expect(advice.told(judgedNo(3, "Keep only the loans of members who joined the reading room this year."))).toEqual(judgedNo(3, "Keep only the loans of members who joined the reading room this year."));
    const unsure = trialAnswer(4, "unsure", { code: "candidate.trial_unconfirmed", unconfirmedReading: { advice: "Keep only loans due on or after 19 March." } });
    expect(advice.told(unsure)).toEqual(unsure);
    const refused: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "subflow.trial_stale_revision", instruction: "Test the latest revision." }, effectApplied: false, targetsUnchanged: true };
    expect(advice.told(refused)).toEqual(refused);
  });

  it("reaches the builder through its test tool, and counts advice an earlier brief was given when the caller shares its memory", async () => {
    // An earlier brief of the build was judged no on revision 0 with other advice; the caller shares its memory.
    const shared = new AutomationStudioSubflowRepeatedAdvice();
    shared.told(judgedNo(0, CALL_2));
    const answers: Array<Pick<AutomationStudioSubflowTrialResult, "verdict" | "feedback">> = [
      { verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { advice: `${CALL_1} ${CALL_2}` } } },
      { verdict: "execution_failed", feedback: { code: "candidate.execution_incomplete", stoppedBy: { kind: "step", step: 3, said: STOPPED } } },
      { verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { advice: CALL_1 } } }
    ];
    const shown: JsonObject[] = [];
    const seen = (evidence: readonly Entry[]) => {
      shown.push(...evidence.filter((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID).slice(shown.length).map((entry) => entry.value as JsonObject));
    };
    const tested = (evidence: readonly Entry[]) => {
      seen(evidence);
      return test(evidence);
    };
    const submitting = (selector: string) => (_evidence: readonly Entry[]): JsonObject => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: `submit${selector}`, input: script([...OPEN, ...callPart(), "part narrow: narrow the listing", "  step: press the filter", "    node: web.dom.click", `    selector: ${selector}`, "    consequences: none", "end"]) });
    const last = (evidence: readonly Entry[]) => {
      seen(evidence);
      return { kind: "complete", result: { ended: "partial", reason: "The judge kept asking for a change that did not work." } };
    };
    let index = 0;
    const steps: Array<(evidence: readonly Entry[]) => JsonObject> = [submitting(".filter"), tested, submitting(".other-filter"), tested, submitting(".third-filter"), tested, last];
    const outcome = await runAutomationStudioSubflowBuilderLoop({
      scope: testScope(), siblings: [...SIBLINGS], submission: testSubmission(), repeatedAdvice: shared,
      trial: { port: async (request: AutomationStudioSubflowTrialRequest) => ({ partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, entryPrepared: true, ...structuredClone(answers.shift()!) }) },
      loop: {
        tools: [look], maxIterations: steps.length, maxToolCalls: steps.length + 2,
        unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
        decide: async ({ evidence }) => steps[index++]!(evidence as readonly Entry[])
      }
    });
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(shown.map((answer) => answer.verdict)).toEqual(["no", "execution_failed", "no"]);
    // The first trial's own advice is new; the earlier brief's sentence is left out and said to be repeated.
    expect(((shown[0]!.feedback as JsonObject).judge as JsonObject).advice).toBe(CALL_1);
    expect(((shown[0]!.feedback as JsonObject).judge as JsonObject).adviceRepeated).toContain("The judge repeated a sentence of the advice it gave after the trial of revision 0");
    const third = (shown[2]!.feedback as JsonObject).judge as JsonObject;
    expect("advice" in third).toBe(false);
    expect(third.adviceRepeated).toContain("The judge repeated a sentence of the advice it gave after the trial of revision 1");
    expect(third.adviceRepeated).toContain(`The trial that followed that advice, of revision 2, answered execution_failed: ${STOPPED}`);
  });
});

// S5 (`run-mvgw3ve5-294881b5`, 0114, 0115, 0151): the judges advised adding a field to the same read
// that the build had been refused `incomplete_text` for, the builder did, and the next trial was refused
// the same way. Once a read was refused so, that advice is said as Core's note instead: since t752 the
// read opens each kept row's own collapsed text itself, so a refusal means it could not, and the note
// says to leave the field out or narrow the conditions, never the two-read shape it once taught.
// (`../disclosure-advice.ts`, through the builder loop and `../repeated-advice.ts`.)
describe("advice to add a field a read was refused incomplete_text for (S5, t743)", () => {
  /** Model guidance never mirrors a realistic Lab scenario (AGENTS.md). */
  const LAB_TASK_WORDS = /friend|earbud|kettle|basket|cart\b|towel|napkin|watchlist|auction|coupon|invitation|classified|giveaway|group|post\b|posts\b|feed\b|circleway|brightaisle|farbazaar|voltbay|tidewell|see more/iu;
  const ADD_FIELD = "Add a due-note field to the read step.loans.s3, opening each row's details.";
  const KEEP = "Keep only loans of the reading room, not the ones held at the bindery.";

  function trialAnswer(revision: number, verdict: string, feedback: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
    return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict === "yes", partial: true, verdict, subflowKey: "find_listing", revision, digest: String(revision).repeat(64), entryPrepared: true, feedback, instruction: "Read the feedback." }, effectApplied: true, targetsUnchanged: false, resultCode: `subflow.trial_${verdict}` };
  }
  const judgedNo = (revision: number, advice: string) => trialAnswer(revision, "no", { code: "candidate.trial_judged_no", judge: { expected: "Every loan with its whole note.", observed: "No note column.", advice } });
  const feedbackOf = (answered: AutomationStudioLlmEvidenceToolExecutionResult) => (answered.evidence as JsonObject).feedback as JsonObject;
  const judgeOf = (answered: AutomationStudioLlmEvidenceToolExecutionResult) => feedbackOf(answered).judge as JsonObject;
  /** A read the downstream domain refused because a field's text was cut short, naming the field. */
  const refusedRead = (key = "due_note"): AutomationStudioLlmEvidenceToolExecutionResult => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "output_not_observed", detail: { reason: "incomplete_text", missing: [key] } }, effectApplied: false, targetsUnchanged: true });

  describe("a judge's advice to add a field a read in this build was refused for", () => {
    it("is passed on as it came before any read was refused so", () => {
      const advice = new AutomationStudioSubflowRepeatedAdvice();
      advice.saw({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "target_not_found", detail: { reason: "handle_not_in_packet" } }, effectApplied: false, targetsUnchanged: true });
      expect(advice.told(judgedNo(1, `Judge call 1: ${ADD_FIELD} Judge call 2: ${KEEP}`))).toEqual(judgedNo(1, `Judge call 1: ${ADD_FIELD} Judge call 2: ${KEEP}`));
    });

    it("is said as Core's note, naming the refused field, once a read was refused for its cut-short text, keeping every other sentence", () => {
      const advice = new AutomationStudioSubflowRepeatedAdvice();
      advice.saw(refusedRead());
      const told = judgeOf(advice.told(judgedNo(1, `Judge call 1: ${ADD_FIELD} Judge call 2: ${KEEP}`)));
      const said = String(told.advice);
      expect(said.startsWith("Judge call 1: Core: a read in this build was already refused because the field `due_note` was cut short on the page and the read could not open it (incomplete_text), so adding it to the same read would be refused again.")).toBe(true);
      expect(said).toContain("The read already opens each kept row's own collapsed text itself, so no click step or repeat will help: leave the field `due_note` out, or narrow the read's conditions so the rows whose text would not open are not kept.");
      // t752 C2: never the two-read shape the note once taught.
      expect(said).not.toMatch(/row-context|repeat over that read|pressing each kept row|read the same listing again|Do this in order/u);
      expect(said.endsWith(`Judge call 2: ${KEEP}`)).toBe(true);
      expect(said).not.toContain("Add a due-note field");
      expect(told).toMatchObject({ expected: "Every loan with its whole note.", observed: "No note column." });
      expect(said.replace(KEEP, "")).not.toMatch(LAB_TASK_WORDS);
    });

    it("says the note once when both calls asked for the field, and counts a trial step refused for cut-short text", () => {
      const advice = new AutomationStudioSubflowRepeatedAdvice();
      const failed = trialAnswer(1, "execution_failed", { code: "candidate.execution_incomplete", steps: [{ step: 4, definitionId: "web.output.dom-extract_list", status: "failed", failureCode: "web.validation.output_not_observed", actual: "incomplete_text: field note" }] });
      expect(advice.told(failed)).toEqual(failed);
      const said = String(judgeOf(advice.told(judgedNo(2, `Judge call 1: ${ADD_FIELD} Judge call 2: Also include the note column in that read.`))).advice);
      expect(said.match(/no click step or repeat will help/gu)).toHaveLength(1);
      expect(said).toContain("leave the text field out");
      expect(said.endsWith("Judge call 2: Core: this call also asked to add the field to the same read; follow the note above instead.")).toBe(true);
    });

    it("rewrites an unsure's readings too, and leaves advice that adds no field as it was", () => {
      const advice = new AutomationStudioSubflowRepeatedAdvice();
      advice.saw(refusedRead());
      const unsure = advice.told(trialAnswer(1, "unsure", { code: "candidate.trial_unconfirmed", unconfirmedReading: { advice: ADD_FIELD }, answeredReading: { advice: KEEP } }));
      expect(String((feedbackOf(unsure).unconfirmedReading as JsonObject).advice)).toContain("no click step or repeat will help");
      expect((feedbackOf(unsure).answeredReading as JsonObject).advice).toBe(KEEP);
      expect(advice.told(judgedNo(2, KEEP))).toEqual(judgedNo(2, KEEP));
    });

    it("reaches the builder through its test tool after a read made through the builder's own tools was refused", async () => {
      const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };
      type Entry = { callId: string; toolId: string; value: unknown };
      const receiptOf = (evidence: readonly Entry[]) => {
        const value = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
        return { revision: value.revision as number, digest: value.digest as string };
      };
      const shown: JsonObject[] = [];
      const steps: Array<(evidence: readonly Entry[]) => JsonObject> = [
        () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit1", input: script([...OPEN, ...callPart(), "part narrow: narrow the listing", "  step: press the filter", "    node: web.dom.click", "    selector: .filter", "    consequences: none", "end"]) }),
        (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: receiptOf(evidence) }),
        (evidence) => {
          shown.push(...evidence.filter((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID).map((entry) => entry.value as JsonObject));
          return { kind: "complete", result: { ended: "partial", reason: "The judged run lacked a column." } };
        }
      ];
      const answer: Pick<AutomationStudioSubflowTrialResult, "verdict" | "feedback"> = { verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { advice: ADD_FIELD } } };
      let index = 0;
      const outcome = await runAutomationStudioSubflowBuilderLoop({
        scope: testScope(), siblings: [...SIBLINGS], submission: testSubmission(),
        trial: { port: async (request: AutomationStudioSubflowTrialRequest) => ({ partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, entryPrepared: true, ...structuredClone(answer) }) },
        loop: {
          tools: [look], maxIterations: steps.length, maxToolCalls: steps.length + 2,
          unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
          executeTool: async (call) => (call.toolId === "core.run_node" && call.callId.startsWith("initial.") ? refusedRead() : { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
          decide: async ({ evidence }) => steps[index++]!(evidence as readonly Entry[])
        }
      });
      expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
      expect(shown).toHaveLength(1);
      const said = String(((shown[0]!.feedback as JsonObject).judge as JsonObject).advice);
      expect(said).toContain("no click step or repeat will help");
      expect(said).not.toContain("Add a due-note field");
    });
  });
});
