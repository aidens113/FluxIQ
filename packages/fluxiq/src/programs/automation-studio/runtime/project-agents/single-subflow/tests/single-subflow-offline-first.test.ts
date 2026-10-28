// P6 (t769, D48): a single-subflow plan's builder test is the supervisor's whole
// trial (`../single-subflow-trial.ts`), and a project build's whole port is
// offline-first. After a live no, the next proposal's whole revision is first
// run against the recording of that live test; a no shown there is kept by the
// supervisor's gate with nothing done on the site, and reaches the builder as a
// trial of its proposal: its gate stands the no, the build's proposals learn
// it, its feedback says the whole test was checked against the recorded run,
// and nothing completes on it. Through the supervisor's loop on the build of
// `./gated-single-build.ts`, its whole port given a stub `offlineFirst`;
// generic data, no model.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioCandidateTrialView, type AutomationStudioCandidateTrialRequest, type AutomationStudioCandidateTrialVerdict } from "../../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as OFFLINE } from "../../../flow-bootstrap/offline-first/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { BUILD, planInput, subflow, taskSpecInput } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, brief, call, dispatch, end, lastOf, supervise, type Step } from "../../supervisor/tests/supervisor-script.ts";
import { gatedSingleBuild } from "./gated-single-build.ts";

const ONE_PART = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const completeOnDispatch: Step = (evidence) => ({ kind: "complete", result: (lastOf(evidence, IDS.dispatch)?.complete as JsonObject | undefined) ?? { ended: "partial", reason: "No test answered yes." } });
/** The builder loop's after-trial page look (`flow-bootstrap/subflow-candidate/builder-loop.ts`): how many looks it sends after `answered`. */
const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };
async function looksAfter(answered: AutomationStudioLlmEvidenceToolExecutionResult): Promise<number> {
  const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { page: "a page" }, effectApplied: false }));
  await automationStudioCandidateTrialView({ answer: answered, tools: [LOOK], executeTool, callId: "call.1" });
  return executeTool.mock.calls.length;
}
const script = (fields: JsonObject) => ["flow: find newest", "step: read the titles", "  node: web.output.read-list", `  readList: ${JSON.stringify({ fields })}`];

describe("a single-subflow builder's test after a live no", () => {
  it("is answered by the no its recording shows: kept with nothing done on the site, learned by the proposals, never completed on", async () => {
    const told: Array<{ revision: number; verdict: AutomationStudioCandidateTrialVerdict }> = [];
    const built = gatedSingleBuild({
      scripts: [script({ title: "title" }), script({ title: "title", year: "year" })],
      trial: () => "no",
      tried: (_scope, proposal, verdict) => told.push({ revision: proposal.revision, verdict })
    });
    const offline: AutomationStudioCandidateTrialRequest[] = [];
    // The whole port's offline-first check: nothing recorded before the first live test, then the recorded run's no.
    Object.assign(built.ports.trial!.port, {
      offlineFirst: async (request: AutomationStudioCandidateTrialRequest) => {
        offline.push(request);
        if (offline.length === 1) return { kind: "live", note: { outcome: "not_tried", why: "no_live_source" } };
        return { kind: "kept", result: { revision: request.revision, digest: request.digest, verdict: "no", feedback: { code: "candidate.trial_no", summary: "The stored rows are not the ones asked for." }, trialRunId: "offline-run" } };
      }
    });

    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), end("partial", "The whole test was judged no.")], built);

    // Two builder tests, each a whole test asked offline first; only the first ran on the site.
    expect(built.tested).toHaveLength(2);
    expect(offline).toHaveLength(2);
    expect(run.trials).toHaveLength(1);
    const [first, kept] = built.tested.map((answer) => answer.evidence as JsonObject);
    expect(first).toMatchObject({ verdict: "no", trialRunId: "run-1" });
    expect(first!.feedback).not.toHaveProperty("wholeTest.checkedAgainst");
    expect(kept).toMatchObject({ verdict: "no", entryPrepared: true, trialRunId: "offline-run", feedback: { wholeTest: { verdict: "no", trialRunId: "offline-run", checkedAgainst: "recorded_run" } } });
    expect(String((kept!.feedback as { wholeTest: { said: string } }).wholeTest.said).startsWith(OFFLINE.kept)).toBe(true);
    // The builder's evidence says it as its gate says its own kept answer: on top, the recording's words first, nothing left on the site, no page look (b17).
    expect(first).not.toHaveProperty("checkedAgainst");
    expect(kept).toMatchObject({ checkedAgainst: "recorded_run" });
    expect(String(kept!.instruction).startsWith(`${OFFLINE.kept} `)).toBe(true);
    expect(String(first!.instruction).startsWith(OFFLINE.kept)).toBe(false);
    expect(kept).not.toHaveProperty("leftOnSite");
    expect(await looksAfter(built.tested[1]!)).toBe(0);
    expect(await looksAfter(built.tested[0]!)).toBe(1);
    // The builder's gate stands the no and refuses completion; the build's proposals learn it.
    const { gate, accepted } = built.gates[0]!;
    expect(gate.standing(accepted[1]!)).toMatchObject({ verdict: "no" });
    expect(gate.completion(accepted[1]!)).toMatchObject({ ok: false });
    expect(told).toEqual([{ revision: 1, verdict: "no" }, { revision: 2, verdict: "no" }]);
    // The supervisor recorded a receipt for each whole test, the kept one naming its offline run, and ended with no yes.
    const receipts = (await run.record.read(BUILD))!.record.receipts.map((entry) => entry.receipt);
    expect(receipts).toEqual([expect.objectContaining({ kind: "candidate_trial", receiptId: "run-1" }), expect.objectContaining({ kind: "candidate_trial", receiptId: "offline-run" })]);
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.trial).toMatchObject({ verdict: "no", trialRunId: "offline-run" });
  });

  it("runs a revision that passes against the recording on the site, says so to the builder, and completes on that live yes", async () => {
    const built = gatedSingleBuild({ scripts: [script({ title: "title" }), script({ title: "title", year: "year" })], trial: (attempt) => (attempt === 1 ? "no" : "yes") });
    let asked = 0;
    Object.assign(built.ports.trial!.port, {
      offlineFirst: async () => (++asked === 1 ? { kind: "live", note: { outcome: "not_tried", why: "no_live_source" } } : { kind: "live", note: { outcome: "passed" } })
    });

    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);

    expect(run.trials).toHaveLength(2);
    const passed = built.tested[1]!.evidence as JsonObject;
    expect(passed).toMatchObject({ verdict: "yes", trialRunId: "run-2", feedback: { wholeTest: { verdict: "yes", offlineCheck: { outcome: "passed", said: OFFLINE.passed } } } });
    expect(passed.feedback).not.toHaveProperty("wholeTest.checkedAgainst");
    expect(passed).not.toHaveProperty("checkedAgainst");
    const { gate, accepted } = built.gates[0]!;
    expect(gate.completion(accepted[1]!)).toEqual({ ok: true });
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
  });
});
