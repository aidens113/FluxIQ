// What a brief's builder starts from, and how its revisions are numbered (A8
// towels `run-mvac0nmw`, t658). A build brief naming a proposal an amendment
// carried (`carriedFrom`) is shown it at its opening look under `startsFrom`
// -- its script, its steps, the parts it was not built for, and to submit and
// test it first -- and its opening call carries its calls, as a repair's does.
// A repair shown its subflow at revision 3 numbers its own revisions from 4,
// and testing the earlier brief's revision 3 is refused naming its own latest.
// The real builder loop runs on a scripted model, on the dispatcher's garden
// catalogue.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { OPEN, callPart, part, script, testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { automationStudioProjectCarriedScript } from "../../amendment/index.ts";
import { automationStudioProjectSubflowBrief, type AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import type { AutomationStudioProjectBuilderPorts } from "../index.ts";
import { automationStudioProjectRenamedOutputs } from "../renamed-outputs.ts";
import { gardenBrief, gardenBuild, REF } from "./dispatch-fixture.ts";

type Entry = { callId: string; toolId: string; value: unknown };
type Decide = (evidence: readonly Entry[]) => JsonObject;

const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } };
const FIRST = script([...OPEN, ...callPart(), ...part()]);
const answerOf = (evidence: readonly Entry[], callId: string) => evidence.find((entry) => entry.callId === callId)?.value as JsonObject | undefined;
const opening = (evidence: readonly Entry[]) => evidence.find((entry) => entry.callId.startsWith("initial."))?.value as JsonObject | undefined;

/** Builder ports whose model takes each brief's own `steps` in turn, brief by brief, every request's evidence and every call the domain received kept; the trial answers `verdict`. */
function ports(briefs: Decide[][], seen: Entry[][], received: Entry[], verdict: () => "yes" | "no") {
  let brief = 0;
  return (): AutomationStudioProjectBuilderPorts => {
    const steps = briefs[brief++]!;
    let step = 0;
    return {
      loop: {
        tools: [LOOK], maxToolCalls: 12,
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
        executeTool: async (call) => {
          received.push({ callId: call.callId, toolId: call.toolId, value: structuredClone(call.value) });
          return { kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "The seed catalogue." }, effectApplied: false, targetsUnchanged: true };
        },
        decide: async ({ evidence }) => {
          seen.push(evidence.map((entry) => ({ ...entry })));
          return steps[step++]!(evidence);
        }
      },
      submission: testSubmission(),
      deniedEvidenceKeys: [],
      trial: async (request) => ({
        partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest,
        verdict: verdict(), feedback: verdict() === "yes" ? {} : { code: "candidate.trial_judged_no", judge: { advice: "Not done." } }, trialRunId: `run.${request.proposal.scope.briefId}.${request.proposal.revision}`, entryPrepared: true
      })
    };
  };
}

const submit = (callId: string, sent: JsonObject): Decide => () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId, input: sent });
const testOf = (callId: string, submitted: string): Decide => (evidence) => {
  const answer = answerOf(evidence, submitted)!;
  return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId, input: { revision: answer.revision as number, digest: answer.digest as string } };
};
const completeOn = (submitted: string): Decide => (evidence) => {
  const answer = answerOf(evidence, submitted)!;
  return { kind: "complete", result: { subflowKey: "list_seeds", revision: answer.revision as number, digest: answer.digest as string } };
};
const endBlocked: Decide = () => ({ kind: "complete", result: { ended: "blocked", reason: "The spring seeds are not listed." } });

describe("a build brief starting from a proposal an amendment carried", () => {
  it("is shown it at its opening and told to test it first, its calls on the opening call, and numbers its revisions on from it", async () => {
    const seen: Entry[][] = [];
    const received: Entry[] = [];
    const steps = [[submit("s1", FIRST), testOf("t1", "s1"), completeOn("s1")], [submit("s2", FIRST), testOf("t2", "s2"), completeOn("s2")]];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: ports(steps, seen, received, () => "yes") } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const first = (await build.run()).returns[0]!;
    expect(first).toMatchObject({ briefId: "b-read", outcome: "done", proposal: { revision: 1 } });
    const before = received.length;

    const carried = gardenBrief("b-carry", "list_seeds", [], (brief) => {
      brief.carriedFrom = { briefId: "b-read", revision: first.proposal!.revision, digest: first.proposal!.digest, addedParts: ["p1"], renamedOutputs: [] };
    });
    await build.store.recordBrief(REF, carried);
    const second = (await build.run([carried])).returns[0]!;
    // Its own first revision follows the one it was shown.
    expect(second).toMatchObject({ briefId: "b-carry", outcome: "done", proposal: { revision: 2 } });

    // The first brief's three decisions came first; the carried brief's first request is the fourth.
    const shown = opening(seen[3]!)!.startsFrom as JsonObject;
    expect(shown).toMatchObject({ revision: 1, digest: first.proposal!.digest, script: FIRST.flow, addedParts: [{ partId: "p1", text: "list the spring seeds" }] });
    expect((shown.steps as JsonObject[]).map((entry) => entry.subflow)).toContain("list_seeds");
    for (const words of ["not done", "Submit it first", "test it", "every part of this brief", "keeping every other step as it is"]) expect(String(shown.note)).toContain(words);
    expect(opening(seen[0]!)).not.toHaveProperty("startsFrom");
    // The opening call carries the carried proposal's calls; the first brief's did not.
    const opened = received.slice(before).find((entry) => entry.callId.startsWith("initial."))!;
    expect(((opened.value as JsonObject).repairs as JsonObject[]).some((call) => call.node === "web.output.browser-navigate")).toBe(true);
    expect(received.slice(0, before).some((entry) => "repairs" in (entry.value as JsonObject))).toBe(false);
  });

  // t671: a narrowing or a merge names what it changed; the script shown is already rewritten (`../../amendment/carried-script.ts`).
  it("shows what a narrowing or merge changed beside a script already rewritten for this subflow", async () => {
    const seen: Entry[][] = [];
    const steps = [[submit("s1", FIRST), testOf("t1", "s1"), completeOn("s1")], [endBlocked]];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: ports(steps, seen, [], () => "yes") } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const first = (await build.run()).returns[0]!;
    const from = { briefId: "b-read", revision: first.proposal!.revision, digest: first.proposal!.digest, addedParts: [], renamedOutputs: [], removedOutputs: ["count"], builtFor: "narrow", routerRun: true as const };
    const carried = gardenBrief("b-merged", "list_seeds", [], (brief) => {
      brief.carriedFrom = from;
    });
    await build.store.recordBrief(REF, carried);
    await build.run([carried]);
    const shown = opening(seen.at(-1)!)!.startsFrom as JsonObject;
    expect(shown).toMatchObject({ removedOutputs: ["count"], builtFor: "narrow", routerRun: true, script: automationStudioProjectCarriedScript(String(FIRST.flow), from, "list_seeds") });
    // The part named under builtFor is unwrapped into the router's steps.
    expect(String(shown.script)).not.toContain("part narrow:");
    expect(String(shown.script)).toContain("step: press the filter");
    for (const words of ["removedOutputs taken out", "routerRun", "builtFor"]) expect(String(shown.note)).toContain(words);
  });

  it("binds a renamed output's line to the same step output under its new name, and nothing else", () => {
    const written = ["part find_seeds: find them", "  input: season", "  output: seeds = $step.rows.records", "  output: seedsCount = $step.count.value", "  step rows: read the rows", "end"].join("\n");
    const renamed = automationStudioProjectRenamedOutputs(written, [{ from: "seeds", to: "list" }]);
    expect(renamed.split("\n")).toEqual(["part find_seeds: find them", "  input: season", "  output: list = $step.rows.records", "  output: seedsCount = $step.count.value", "  step rows: read the rows", "end"]);
  });

  it("is refused for a carried proposal on any brief but a build", () => {
    const brief = gardenBrief("b-x", "list_seeds", [], (value) => {
      value.kind = "repair";
      value.failingReceipt = { kind: "candidate_trial", receiptId: "run-1", digest: "a".repeat(64) };
      value.carriedFrom = { briefId: "b-read", revision: 1, digest: "c".repeat(64), addedParts: [], renamedOutputs: [] };
    });
    expect(automationStudioProjectSubflowBrief.parse(JSON.parse(JSON.stringify(brief)))).toMatchObject({ status: "invalid", code: "project.brief_carried_from", path: "brief.carriedFrom" });
  });
});

describe("a repair brief shown its subflow at an earlier brief's revision 3", () => {
  it("numbers its own first revision 4, and its test of revision 3 is refused naming its own latest", async () => {
    const seen: Entry[][] = [];
    const received: Entry[] = [];
    let verdict: "yes" | "no" = "no";
    const third = script([...OPEN, ...callPart("third"), ...part("third")]);
    const steps: Decide[][] = [
      // The first brief makes three revisions and its last trial answers no.
      [submit("a1", FIRST), submit("a2", script([...OPEN, ...callPart("second"), ...part("second")])), submit("a3", third), testOf("a-test", "a3"), endBlocked],
      // The repair resubmits, tests the earlier brief's revision 3 by mistake, then its own.
      [
        submit("r1", third),
        (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "r-stale", input: { revision: 3, digest: answerOf(evidence, "r1")!.digest as string } }),
        testOf("r-test", "r1"), completeOn("r1")
      ]
    ];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: ports(steps, seen, received, () => verdict) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const first = (await build.run()).returns[0]!;
    expect(first).toMatchObject({ briefId: "b-read", outcome: "blocked" });
    const failing = first.trials.at(-1)!;
    expect(answerOf(seen.at(-1)!, "a3")).toMatchObject({ revision: 3 });

    const fix: AutomationStudioProjectSubflowBrief = gardenBrief("b-fix", "list_seeds", [], (brief) => {
      brief.kind = "repair";
      brief.failingReceipt = { kind: failing.kind, receiptId: failing.receiptId, digest: failing.digest };
    });
    await build.store.recordBrief(REF, fix);
    verdict = "yes";
    const repaired = (await build.run([fix])).returns[0]!;
    expect(repaired).toMatchObject({ briefId: "b-fix", outcome: "done", proposal: { revision: 4 } });
    const last = seen.at(-1)!;
    expect(((opening(last)!.repairOf as JsonObject).yourSubflow as JsonObject).revision).toBe(3);
    expect(answerOf(last, "r1")).toMatchObject({ ok: true, revision: 4 });
    const stale = answerOf(last, "r-stale")!;
    expect(stale).toMatchObject({ ok: false, code: "subflow.trial_stale_revision", latestRevision: 4, earlierRevision: 3 });
    expect(String(stale.instruction)).toContain("Revision 3 is not one of this brief's");
  });
});
