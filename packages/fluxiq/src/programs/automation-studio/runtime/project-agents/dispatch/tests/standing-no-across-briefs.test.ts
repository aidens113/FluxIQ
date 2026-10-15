// A subflow's standing nos cross its briefs, and a brief's receipts carry its
// gate's verdict (t634). A8 wave 8 towels: brief 1's trial upheld a no calling
// a stored row not the asked kind; repair brief 2, a builder loop with a gate
// of its own, then left that row out by conditions it added, and its judges
// said no asking to remove exactly those conditions. Brief 2's gate never saw
// brief 1's record, and the receipts read each trial before any gate weighed
// it. The real builder loop and the real gate run here on a scripted model;
// Core's records are written by hand, on a seed catalogue (shaped unlike any
// Lab scenario).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { OPEN, callPart, part, script, testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import type { AutomationStudioResultStandingNoRecord } from "../../../result-verification/standing-no/index.ts";
import type { AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import type { AutomationStudioProjectBuilderPorts } from "../index.ts";
import { gardenBrief, gardenBuild, REF } from "./dispatch-fixture.ts";

type Entry = { callId: string; toolId: string; value: unknown };

const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } };
const TRAY = "Peat Seed Starter Tray, 72 Cells";
const SEEDS = ["Sweet Pea 'Matucana' Seeds", "Cosmos 'Purity' Seeds", "Nasturtium 'Empress of India' Seeds"];
const BASE = [
  { name: "condition 1 (season contains [\"Spring\"])", key: "season contains [\"spring\"]", leftOutAlone: ["Kale 'Winterbor' Seeds"] },
  { name: "condition 2 (in stock is present)", key: "in stock is present", leftOutAlone: [] }
];
const NAMED_SEEDS = { name: "condition 3 (name contains [\"Seeds\"])", key: "name contains [\"seeds\"]", leftOutAlone: [] };
const NOT_TRAY = { name: "condition 4 (name not contains [\"Tray\"])", key: "name not contains [\"tray\"]", leftOutAlone: [] };
/** Brief 1's trial: the tray stored, and a standing no calling it not the kind of thing the parts ask for. */
const UPHELD: AutomationStudioResultStandingNoRecord = { stored: [...SEEDS, TRAY], storedWhole: true, conditions: BASE, upheldKind: [TRAY], standing: [{ call: 1 }, { call: 2 }] };
/** Repair brief 2's trial: the name conditions added, the tray no longer stored, and both nos asking to remove them. */
const REMOVE_THEM: AutomationStudioResultStandingNoRecord = {
  stored: [...SEEDS], storedWhole: true, conditions: [...BASE, NAMED_SEEDS, NOT_TRAY],
  standing: [{ call: 1, drops: [NAMED_SEEDS.key, NOT_TRAY.key] }, { call: 2, drops: [NAMED_SEEDS.key, NOT_TRAY.key] }]
};
const JUDGED_NO: JsonObject = { code: "candidate.trial_judged_no", why: "The judges found the read did not list what the parts ask for.", stored: { rows: 3 } };

const submitted = (evidence: readonly Entry[]) => {
  const value = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
  return { revision: value.revision as number, digest: value.digest as string };
};

/** A builder whose model submits, tests once, then ends blocked; what each test answered is kept in `tested`, and its port answers no with `record`. */
function scripted(record: () => AutomationStudioResultStandingNoRecord, tested: JsonObject[]) {
  return (): AutomationStudioProjectBuilderPorts => {
    let step = 0;
    const steps = [
      () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: `submit-${tested.length}`, input: script([...OPEN, ...callPart(), ...part()]) }),
      (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: `test-${tested.length}`, input: submitted(evidence) }),
      (evidence: readonly Entry[]) => {
        tested.push([...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID)!.value as JsonObject);
        return { kind: "complete", result: { ended: "blocked", reason: "The read does not list what the parts ask for." } };
      }
    ];
    return {
      loop: {
        tools: [LOOK], maxToolCalls: 8,
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "The seed catalogue." }, effectApplied: false, targetsUnchanged: true }),
        decide: async ({ evidence }) => steps[step++]!(evidence)
      },
      submission: testSubmission(),
      deniedEvidenceKeys: [],
      trial: async (request) => ({
        partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest,
        verdict: "no", feedback: structuredClone(JUDGED_NO), trialRunId: `run.${request.proposal.scope.briefId}`, entryPrepared: true,
        standingNo: structuredClone(record())
      }) as AutomationStudioSubflowTrialResult
    };
  };
}

function repair(briefId: string, failing: { kind: "subflow_trial"; receiptId: string; digest: string }, change?: (brief: AutomationStudioProjectSubflowBrief) => void): AutomationStudioProjectSubflowBrief {
  return gardenBrief(briefId, "list_seeds", [], (brief) => {
    brief.kind = "repair";
    brief.failingReceipt = failing;
    change?.(brief);
  });
}

describe("a subflow's standing nos across its briefs (t634)", () => {
  it("hold repair brief 2's no to the kind exclusion brief 1's trial upheld: weighed contradicted, unsure, and its receipt says unsure", async () => {
    const tested: JsonObject[] = [];
    let record = UPHELD;
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: scripted(() => record, tested) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const first = (await build.run()).returns[0]!;
    // Brief 1's no stands: nothing earlier contradicts it.
    expect(tested[0]).toMatchObject({ verdict: "no", feedback: { code: "candidate.trial_judged_no" } });
    expect(tested[0]!.feedback).not.toHaveProperty("contradictedByBuild");
    expect(first.trials).toMatchObject([{ kind: "subflow_trial", receiptId: "run.b-read", verdict: "no" }]);

    const { kind, receiptId, digest } = first.trials[0]!;
    const fix = repair("b-fix", { kind: kind as "subflow_trial", receiptId, digest });
    await build.store.recordBrief(REF, fix);
    record = REMOVE_THEM;
    const second = (await build.run([fix])).returns[0]!;

    // The repair's gate weighed its no against brief 1's upheld record: not taken, so unsure, its revision not closed.
    const answer = tested[1]!;
    expect(answer).toMatchObject({ verdict: "unsure", ok: false, retestsLeft: expect.any(Number) });
    const feedback = answer.feedback as JsonObject;
    // The trial's own code stays first; Core's words ride beside it.
    expect(feedback.code).toBe("candidate.trial_judged_no");
    const said = String(feedback.contradictedByBuild);
    expect(said).toContain("A revision of this subflow that an earlier brief tested, read without condition 3");
    expect(said).toContain("this no is not taken: the verdict is unsure, not no");
    // A count, never the row's label, and no revision number that is not one of this brief's.
    expect(said).not.toContain(TRAY);
    expect(said).not.toMatch(/Revision -?\d/u);
    expect(String(answer.instruction)).toContain("an earlier no of this subflow");
    // The receipt and the return carry the gate's verdict, not the port's.
    expect(second.trials).toMatchObject([{ kind: "subflow_trial", receiptId: "run.b-fix", verdict: "unsure", rows: 3 }]);
    expect(second.reason).toContain("answered unsure (candidate.trial_judged_no)");
    // The record stays Core's: nothing the builder was shown carries it.
    expect(JSON.stringify(tested)).not.toContain("standingNo");
  });

  it("leaves a repair's no standing where no earlier brief of the subflow upheld anything", async () => {
    const tested: JsonObject[] = [];
    const build = await gardenBuild({ capacity: 1, briefs: [], ports: { builder: scripted(() => REMOVE_THEM, tested) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const fix = repair("b-fix", { kind: "subflow_trial", receiptId: "run.elsewhere", digest: "a".repeat(64) });
    await build.store.recordBrief(REF, fix);
    const returned = (await build.run([fix])).returns[0]!;
    expect(tested[0]).toMatchObject({ verdict: "no", feedback: { code: "candidate.trial_judged_no" } });
    expect(tested[0]!.feedback).not.toHaveProperty("contradictedByBuild");
    expect(returned.trials).toMatchObject([{ receiptId: "run.b-fix", verdict: "no" }]);
  });
});
