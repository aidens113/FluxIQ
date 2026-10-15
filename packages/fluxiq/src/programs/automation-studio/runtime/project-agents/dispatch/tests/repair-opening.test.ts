// A repair builder is shown the trial it repairs (bigbox debug fix 2, t595).
// Bigbox `run-mv8c7unr-42a8456d` sent eight repairs whose builders' opening
// requests held no receipt, no failure and no word of what had gone wrong, so
// each explored from scratch and wrote the same steps again. The real builder
// loop runs here on a scripted model: its first request's opening look now
// carries `repairOf`, the trial the brief names, and since t622 the subflow
// it repairs as Core accepted it (`yourSubflow`), and since t625 its steps with
// the domain's denied keys withheld, packed through the real context packet.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { OPEN, callPart, part, script, testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema, type AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE, AutomationStudioLlmRequestRefusedError, packAutomationStudioLlmContext, screenAutomationStudioLlmEvidence, type AutomationStudioLlmHarnessInput } from "../../../llm/harness/index.ts";
import type { AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import { createAutomationStudioProjectDispatcher, type AutomationStudioProjectBuilderPorts } from "../index.ts";
import { gardenBrief, gardenBuild, REF } from "./dispatch-fixture.ts";

type Entry = { callId: string; toolId: string; value: unknown };

const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } };
/** A whole test that stopped at a step, as the trial's feedback lists its steps. */
const STOPPED: JsonObject = {
  code: "candidate.trial_execution_failed",
  steps: [
    { step: 1, definitionId: "web.browser.navigate", label: "open the catalogue", status: "succeeded" },
    { step: 2, definitionId: "web.dom.click", label: "press spring seeds", control: "Spring seeds", status: "failed", failureCode: "web.target.not_found", happened: "The control was not on the page.", retryable: false }
  ],
  start: "reset"
};

const submitted = (evidence: readonly Entry[]) => {
  const value = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
  return { revision: value.revision as number, digest: value.digest as string };
};

/** A builder whose model submits, tests, then completes on a yes or ends blocked on anything else; every request's evidence is kept. */
function scripted(verdict: "yes" | "no", firstSeen: Entry[][], deniedEvidenceKeys: readonly string[] = []) {
  return (): AutomationStudioProjectBuilderPorts => {
    let step = 0;
    const steps = [
      (evidence: readonly Entry[]) => {
        firstSeen.push(evidence.map((entry) => ({ ...entry })));
        return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: `submit-${firstSeen.length}`, input: script([...OPEN, ...callPart(), ...part()]) };
      },
      (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: `test-${firstSeen.length}`, input: submitted(evidence) }),
      (evidence: readonly Entry[]) => ({ kind: "complete", result: verdict === "yes" ? { subflowKey: "list_seeds", ...submitted(evidence) } : { ended: "blocked", reason: "The spring seeds control is not on the page." } })
    ];
    return {
      loop: {
        tools: [LOOK], maxToolCalls: 8,
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "The seed catalogue." }, effectApplied: false, targetsUnchanged: true }),
        decide: async ({ evidence }) => steps[step++]!(evidence)
      },
      submission: testSubmission(),
      deniedEvidenceKeys,
      trial: async (request) => ({
        partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest,
        verdict, feedback: verdict === "yes" ? {} : STOPPED, trialRunId: `run.${request.proposal.scope.briefId}`, entryPrepared: true
      })
    };
  };
}

/** The opening look's evidence in a request, where `repairOf` is shown. */
const opening = (evidence: readonly Entry[]) => evidence.find((entry) => entry.callId.startsWith("initial."))?.value as JsonObject | undefined;

function repair(briefId: string, change: (brief: AutomationStudioProjectSubflowBrief) => void): AutomationStudioProjectSubflowBrief {
  return gardenBrief(briefId, "list_seeds", [], (brief) => {
    brief.kind = "repair";
    change(brief);
  });
}

describe("a repair brief's builder", () => {
  it("is shown the whole test the brief carries in its first request: the step it stopped at and what it said", async () => {
    const firstSeen: Entry[][] = [];
    const brief = repair("b-fix", (value) => {
      value.failingReceipt = { kind: "candidate_trial", receiptId: "run-7", digest: "a".repeat(64) };
      value.failingTrial = { verdict: "execution_failed", failedStep: (STOPPED.steps as JsonObject[])[1]!, said: { code: "candidate.trial_execution_failed", start: "reset" } };
    });
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { builder: scripted("yes", firstSeen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-fix", outcome: "done" });
    const shown = opening(firstSeen[0]!);
    expect(shown?.page).toBe("The seed catalogue.");
    expect(shown?.repairOf).toMatchObject({
      receipt: { kind: "candidate_trial", receiptId: "run-7" },
      verdict: "execution_failed",
      failedStep: { step: 2, definitionId: "web.dom.click", label: "press spring seeds", failureCode: "web.target.not_found", happened: "The control was not on the page." },
      said: { code: "candidate.trial_execution_failed", start: "reset" }
    });
    expect(String((shown!.repairOf as JsonObject).note)).toContain("failedStep");
  });

  it("is shown a subflow trial an earlier brief of the build ran, by the receipt its return listed; a build brief is shown none", async () => {
    const firstSeen: Entry[][] = [];
    let verdict: "yes" | "no" = "no";
    const builder = () => scripted(verdict, firstSeen)();
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const first = (await build.run()).returns[0]!;
    expect(first).toMatchObject({ briefId: "b-read", outcome: "blocked", trials: [{ kind: "subflow_trial", receiptId: "run.b-read" }] });
    expect(opening(firstSeen[0]!)).not.toHaveProperty("repairOf");

    // The reference alone: the verdict and rows listed beside it (t606) are not part of it.
    const { kind, receiptId, digest } = first.trials[0]!;
    const fix = repair("b-fix", (value) => (value.failingReceipt = { kind, receiptId, digest }));
    await build.store.recordBrief(REF, fix);
    verdict = "yes";
    expect((await build.run([fix])).returns[0]).toMatchObject({ briefId: "b-fix", outcome: "done" });
    expect(opening(firstSeen[1]!)?.repairOf).toMatchObject({
      receipt: { kind: "subflow_trial", receiptId: "run.b-read" },
      verdict: "no",
      failedStep: { step: 2, label: "press spring seeds", failureCode: "web.target.not_found" },
      said: { code: "candidate.trial_execution_failed", start: "reset" }
    });
  });

  it("is shown a whole test that passed only on the run's own recovery as what to answer: each step it recovered at and what the Flow needs there (t603)", async () => {
    const firstSeen: Entry[][] = [];
    const interruption: JsonObject = {
      step: 3, label: "press save", definitionId: "web.dom.click", control: "Save",
      absorbed: [{ failureCode: "web.action.rate_limited", happened: "The site asked the run to slow down on pass 2, and to try again in 5 s.", askedWaitMs: 5000, waitedMs: 5000 }],
      interruptions: [{ kind: "rate_limit", wayOut: "t40", said: "The run closed the site's notice by its way out, t40." }],
      needs: { paceAtLeastMs: 5000, wayOut: "t40", waitAtLeastMs: 5000 }
    };
    const brief = repair("b-paced", (value) => {
      value.failingReceipt = { kind: "candidate_trial", receiptId: "run-8", digest: "a".repeat(64) };
      value.failingTrial = { verdict: "yes", interruptions: [interruption], said: { judge: "Judged to do what was asked." } };
    });
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { builder: scripted("yes", firstSeen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    expect((await build.run()).returns[0]).toMatchObject({ briefId: "b-paced", outcome: "done" });
    const shown = opening(firstSeen[0]!)?.repairOf as JsonObject;
    expect(shown).toMatchObject({ receipt: { kind: "candidate_trial", receiptId: "run-8" }, verdict: "yes", interruptions: [interruption], said: { judge: "Judged to do what was asked." } });
    const note = String(shown.note);
    for (const words of ["interruptions", "needs.paceAtLeastMs", "`repeat pace:`", "`optional: yes`", "`builtin.timing.wait`", "`only after:`", "end the brief blocked"]) expect(note).toContain(words);
    // Model guidance never teaches to the test: the note names no realistic scenario's site or task.
    expect(note.match(/store|shop|marketplace|retail|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu)?.[0]).toBeUndefined();
    expect(note.match(/friend|cart\b|basket|bid\b|watchlist|coupon|connection|invitation|job|quote|rate limit|digest|quantity|rating/iu)?.[0]).toBeUndefined();
  });

  // A8 social `run-mv96rz6h` (t622): the repair of a passing subflow was told to keep every other step, saw a blank Flow and rewrote it from nothing.
  it("is shown the subflow it repairs as Core accepted it: the latest done proposal's script and its resolved steps (t622)", async () => {
    const firstSeen: Entry[][] = [];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: scripted("yes", firstSeen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const first = (await build.run()).returns[0]!;
    expect(first).toMatchObject({ briefId: "b-read", outcome: "done", proposal: { subflowKey: "list_seeds" } });
    expect(opening(firstSeen[0]!)).not.toHaveProperty("repairOf");

    const fix = repair("b-paced", (value) => {
      value.failingReceipt = { kind: "candidate_trial", receiptId: "run-9", digest: "a".repeat(64) };
      value.failingTrial = { verdict: "yes", interruptions: [{ step: 2, label: "press the filter", needs: { paceAtLeastMs: 3000 } }], said: { judge: "Judged to do what was asked." } };
    });
    await build.store.recordBrief(REF, fix);
    await build.run([fix]);
    const yours = (opening(firstSeen[1]!)?.repairOf as JsonObject).yourSubflow as JsonObject;
    expect(yours).toMatchObject({ revision: first.proposal!.revision, digest: first.proposal!.digest, script: script([...OPEN, ...callPart(), ...part()]).flow });
    const steps = yours.steps as JsonObject[];
    expect(steps.map((entry) => entry.subflow)).toContain("list_seeds");
    expect(steps.flatMap((entry) => (entry.nodes as JsonObject[]).map((node) => node.node))).toEqual(expect.arrayContaining(["web.output.browser-navigate", "web.output.dom-click"]));
    const note = String(yours.note);
    for (const words of ["script", "steps", "handle", "keep every other step as it is"]) expect(note).toContain(words);
    // Model guidance never teaches to the test.
    expect(note.match(/store|shop|marketplace|retail|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu)?.[0]).toBeUndefined();
    expect(note.match(/friend|cart\b|basket|bid\b|watchlist|coupon|connection|invitation|job|quote|rate limit|digest|quantity|rating/iu)?.[0]).toBeUndefined();
  });

  it("is shown the proposal a failing subflow trial ran, even when that brief came back without a done return (t622)", async () => {
    const firstSeen: Entry[][] = [];
    let verdict: "yes" | "no" = "no";
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: () => scripted(verdict, firstSeen)() } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const first = (await build.run()).returns[0]!;
    expect(first).toMatchObject({ outcome: "blocked" });
    const { kind, receiptId, digest } = first.trials[0]!;
    const fix = repair("b-fix", (value) => (value.failingReceipt = { kind, receiptId, digest }));
    await build.store.recordBrief(REF, fix);
    verdict = "yes";
    await build.run([fix]);
    const yours = (opening(firstSeen[1]!)?.repairOf as JsonObject).yourSubflow as JsonObject;
    expect(yours).toMatchObject({ revision: 1, script: script([...OPEN, ...callPart(), ...part()]).flow });
  });

  it("is told plainly when the subflow it repairs is not held here (t622)", async () => {
    const firstSeen: Entry[][] = [];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: scripted("yes", firstSeen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const first = (await build.run()).returns[0]!;
    const fix = repair("b-fix", (value) => {
      value.failingReceipt = { kind: "candidate_trial", receiptId: "run-9", digest: "a".repeat(64) };
      value.failingTrial = { verdict: "no", said: { judge: "Not done." } };
    });
    await build.store.recordBrief(REF, fix);
    // A dispatcher made again for the same build holds none of the proposals the first one's builders had accepted.
    const again = createAutomationStudioProjectDispatcher({ ...build.dispatcherInput });
    await build.cancellation.run(REF.projectId, REF.flowId, async () => {
      await again({ briefs: [fix], signal: new AbortController().signal });
    });
    const yours = (opening(firstSeen.at(-1)!)?.repairOf as JsonObject).yourSubflow as JsonObject;
    expect(yours).toEqual({ revision: first.proposal!.revision, digest: first.proposal!.digest, note: expect.stringContaining("not held here") });
  });

  it("is told plainly when the trial its brief names is not held, never shown a failure it cannot see", async () => {
    const firstSeen: Entry[][] = [];
    const brief = repair("b-fix", (value) => (value.failingReceipt = { kind: "subflow_trial", receiptId: "run.elsewhere", digest: "d".repeat(64) }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { builder: scripted("yes", firstSeen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    await build.run();
    const said = opening(firstSeen[0]!)?.repairOf as JsonObject;
    expect(said).toMatchObject({ receipt: { kind: "subflow_trial", receiptId: "run.elsewhere" } });
    expect(said).not.toHaveProperty("verdict");
    expect(String(said.note)).toContain("is not held here");
  });
});

// A8 wave 6 `run-mv9a48cs` (t625): `yourSubflow`'s steps are the parameters as
// Core resolved them, and a web click resolves to `selector` -- a key the web
// domain denies -- so every repair's opening request was refused before its
// first turn (`flow_bootstrap.request_refused_evidence_denied_key`). The t622
// cases above never went through the context packet, so they could not see it.
describe("a repair brief's opening, shown the subflow it repairs (t625)", () => {
  const WEB_DENIED_EVIDENCE_KEYS = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;
  /** The script's own locator for its press, as `part()` writes it. */
  const LOCATOR = ".filter";

  /** The repair's first request's evidence, after an earlier brief of the build came back done; `denied` is what the ports declare. */
  async function repairFirstRequest(denied: readonly string[]): Promise<Entry[]> {
    const firstSeen: Entry[][] = [];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: scripted("yes", firstSeen, denied) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    expect((await build.run()).returns[0]).toMatchObject({ briefId: "b-read", outcome: "done" });
    const fix = repair("b-fix", (value) => {
      value.failingReceipt = { kind: "candidate_trial", receiptId: "run-10", digest: "a".repeat(64) };
      value.failingTrial = { verdict: "no", said: { judge: "Not done." } };
    });
    await build.store.recordBrief(REF, fix);
    await build.run([fix]);
    return firstSeen[1]!;
  }

  /** The decision request the builder loop asks for with `evidence`, as `llm/harness/tests/draft-screen.test.ts` builds one. */
  function decision(evidence: readonly Entry[]): AutomationStudioLlmHarnessInput {
    const completionSchema = { type: "object" };
    return {
      taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", runId: "run.one", instructions: [],
      deniedEvidenceKeys: WEB_DENIED_EVIDENCE_KEYS,
      evidenceLoop: { iteration: evidence.length + 1, tools: [LOOK], evidence: evidence.map((entry) => ({ ...entry, value: entry.value as JsonValue })), decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema([LOOK], completionSchema, true), completionSchema, canComplete: true }
    };
  }

  it("carries the resolved steps' denied keys only when the ports declare none: the precondition of the defect", async () => {
    const yours = (opening(await repairFirstRequest([]))?.repairOf as JsonObject).yourSubflow as JsonObject;
    expect(screenAutomationStudioLlmEvidence(yours, ["selector"]).deniedKey).toBe(true);
    expect(JSON.stringify(yours.steps)).toContain(LOCATOR);
    expect(yours).not.toHaveProperty("withheld");
  });

  it("withholds the domain's denied keys from the steps it shows, and says so", async () => {
    const shown = opening(await repairFirstRequest(WEB_DENIED_EVIDENCE_KEYS))?.repairOf as JsonObject;
    expect(screenAutomationStudioLlmEvidence(shown, ["selector"]).deniedKey).toBe(false);
    const yours = shown.yourSubflow as JsonObject;
    expect(yours.withheld).toBe(AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE);
    expect(JSON.stringify(yours.steps)).not.toContain(`"selector"`);
    // What the repair needs to keep its steps is still there: the script it sent, and each step's node.
    expect(yours.script).toBe(script([...OPEN, ...callPart(), ...part()]).flow);
    expect((yours.steps as JsonObject[]).flatMap((entry) => (entry.nodes as JsonObject[]).map((node) => node.node))).toEqual(expect.arrayContaining(["web.output.dom-click"]));
  });

  it("is packed through the real context packet without refusal; unscreened, the same opening is refused as the runs were", async () => {
    const packed = packAutomationStudioLlmContext(decision(await repairFirstRequest(WEB_DENIED_EVIDENCE_KEYS)));
    const sent = packed.evidenceLoop!.evidence.find((entry) => entry.callId.startsWith("initial."))!.value as JsonObject;
    expect((sent.repairOf as JsonObject).yourSubflow).toMatchObject({ withheld: AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE });

    // The guard stays: the route t622 opened is caught at the packet, before any provider call.
    let caught: unknown;
    try { packAutomationStudioLlmContext(decision(await repairFirstRequest([]))); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AutomationStudioLlmRequestRefusedError);
    expect((caught as AutomationStudioLlmRequestRefusedError).code).toBe("llm.request.evidence_denied_key");
  });
});
