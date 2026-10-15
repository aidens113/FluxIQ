// A repair builder is shown the trial it repairs (bigbox debug fix 2, t595).
// Bigbox `run-mv8c7unr-42a8456d` sent eight repairs whose builders' opening
// requests held no receipt, no failure and no word of what had gone wrong, so
// each explored from scratch and wrote the same steps again. The real builder
// loop runs here on a scripted model: its first request's opening look now
// carries `repairOf`, the trial the brief names.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { OPEN, callPart, part, script, testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import type { AutomationStudioProjectBuilderPorts } from "../index.ts";
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
function scripted(verdict: "yes" | "no", firstSeen: Entry[][]) {
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
