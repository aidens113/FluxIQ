// The dispatcher with the real loops behind it: the subflow builder's loop
// (`flow-bootstrap/subflow-candidate/builder-loop.ts`) with the candidate
// refusal tests' stub domain, and a reset brief's evidence loop. The model is
// a script.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSiteResetNamedAct } from "../../../flow-bootstrap/site-reset/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowBuilderOutcome, type AutomationStudioSubflowTrialRequest } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { OPEN, callPart, part, script, testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../llm/evidence-loop.ts";
import { automationStudioProjectStructurePlan } from "../../contracts/index.ts";
import type { AutomationStudioProjectBuilderPorts, AutomationStudioProjectResetPorts } from "../index.ts";
import { gardenBrief, gardenBuild, gardenPlan, REF, type BuilderScript } from "./dispatch-fixture.ts";

type Entry = { callId: string; toolId: string; value: unknown };
/** What settles an open act, as a ledger words it (generic). */
const SETTLE = "Read destination-1 at loc:list completely again.";
const submitted = (evidence: readonly Entry[]) => {
  const value = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
  return { revision: value.revision as number, digest: value.digest as string };
};

describe("a dispatched brief's loop", () => {
  it("builds a subflow with the real builder loop: done with its proposal, its trial's receipt and its spend in the record", async () => {
    const asked: AutomationStudioSubflowTrialRequest[] = [];
    const steps = [
      () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) }),
      (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: submitted(evidence) }),
      (evidence: readonly Entry[]) => ({ kind: "complete", result: { subflowKey: "list_seeds", ...submitted(evidence) } })
    ];
    let step = 0;
    const builder = (): AutomationStudioProjectBuilderPorts => ({
      loop: {
        tools: [], maxToolCalls: 6,
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
        decide: async ({ evidence }) => steps[step++]!(evidence)
      },
      submission: testSubmission(),
      deniedEvidenceKeys: [],
      trial: async (request) => {
        asked.push(request);
        return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: {}, trialRunId: "run.trial-1", entryPrepared: true };
      }
    });
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const { returns } = await build.run();
    expect(returns[0], JSON.stringify(returns[0])).toMatchObject({ briefId: "b-read", outcome: "done", proposal: { subflowKey: "list_seeds", revision: 1 }, trials: [{ kind: "subflow_trial", receiptId: "run.trial-1" }] });
    expect(asked[0]!.scope).toMatchObject({ buildId: REF.buildId, briefId: "b-read", subflowKey: "list_seeds", parts: [{ partId: "p1", sourceId: "instruction.1", text: "list the spring seeds" }] });
    expect(asked[0]!.scope.successCheck).toEqual([{ fact: "text", op: "contains", value: "Seeds", target: { handle: "t8" } }]);
    expect((await build.store.read(REF))!.returns[0]!.builderReturn).toEqual(returns[0]);
  });

  it("ends a reset that leaves acts on the site as blocked, naming each act still to undo", async () => {
    const left: AutomationStudioSiteResetNamedAct[] = [{ act: "act-1", did: "press \"Add to planting list\" button" }];
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [],
        unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ ok: true }),
        decide: async () => ({ kind: "complete", result: { summary: "done" } })
      },
      remainingActs: async () => left
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "blocked" });
    expect(returns[0]!.reason).toContain("1 act is still to undo: act-1");
    expect(returns[0]).not.toHaveProperty("proposal");
  });

  it("completes a reset only once nothing of the build is left to undo", async () => {
    let left: AutomationStudioSiteResetNamedAct[] = [{ act: "act-1", did: "press \"Add to planting list\" button" }];
    const seenFeedback: unknown[] = [];
    let step = 0;
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("the reset stalled") },
        executeTool: async () => {
          left = [];
          return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, targetsUnchanged: false };
        },
        decide: async ({ evidence }) => {
          seenFeedback.push(...evidence.map((entry) => entry.value));
          step += 1;
          if (step === 2) return { kind: "tool_call", toolId: "site.undo", callId: "undo.1", input: { undoes: "act-1" } };
          return { kind: "complete", result: { summary: "the planting list is as it was" } };
        }
      },
      remainingActs: async () => left
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 4 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    const { returns } = await build.run();
    expect(JSON.stringify(seenFeedback)).toContain("project.reset_acts_in_place");
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "done" });
    expect((await build.store.read(REF))!.returns[0]!.builderReturn.outcome).toBe("done");
  });

  it("hands the acts a reset's completion names under cannotUndo to what it asks is left, and ends done once they are kept (t591)", async () => {
    const asked: Array<readonly string[] | undefined> = [];
    let kept = false;
    let step = 0;
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ ok: true }),
        decide: async () => {
          step += 1;
          return step === 1
            ? { kind: "complete", result: { summary: "nothing to undo here" } }
            : { kind: "complete", result: { summary: "the site offers no control that takes it back", cannotUndo: ["act-1"] } };
        }
      },
      // As the ledger does: an act named under cannotUndo once a refusal asked for it is kept from then on.
      remainingActs: async (cannotUndo) => {
        asked.push(cannotUndo);
        if (asked.length > 1 && cannotUndo?.includes("act-1")) kept = true;
        return kept ? [] : [{ act: "act-1", did: "press \"Confirm\" button" }];
      }
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 4 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    const { returns } = await build.run();
    expect(asked.slice(0, 2)).toEqual([undefined, ["act-1"]]);
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "done" });
  });

  // L1 reset settlement: the refusal lists each open act with what settles it, and says what cannotUndo truly does.
  it("tells a reset whose completion is refused what settles each act and when to name one under cannotUndo (t591, L1)", async () => {
    const seen: unknown[] = [];
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ ok: true }),
        decide: async ({ evidence }) => {
          seen.push(...evidence.map((entry) => entry.value));
          return { kind: "complete", result: { summary: "done" } };
        }
      },
      remainingActs: async () => [{ act: "act-1", did: "press \"Confirm\" button", settle: SETTLE }]
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    await build.run();
    const refusal = seen.find((value): value is JsonObject => typeof value === "object" && value !== null && (value as JsonObject).code === "project.reset_acts_in_place")!;
    expect(refusal.actsToUndo).toEqual([{ act: "act-1", did: "press \"Confirm\" button", settle: SETTLE }]);
    const instruction = String(refusal.instruction);
    expect(instruction).toContain("Each listed act says under settle what settles it");
    expect(instruction).toContain("it never settles a reversible act whose watched state still differs: such an act stays listed with what settles it");
    expect(instruction).toContain("complete with an honest unresolved summary naming every such act under cannotUndo");
    expect(instruction).not.toContain("kept as done");
  });

  it("ends a reset unresolved, blocked with the act still to undo, once it names under cannotUndo an act a refusal listed with what settles it (L1)", async () => {
    let step = 0;
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ ok: true }),
        decide: async () => {
          step += 1;
          return { kind: "complete", result: { summary: "the site offers no control that takes it back", cannotUndo: ["act-1"] } };
        }
      },
      // A reversible act whose watched state still differs: naming it never settles it.
      remainingActs: async () => [{ act: "act-1", did: "press \"Confirm\" button", settle: SETTLE }]
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 4 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    const { returns } = await build.run();
    // Its first naming is refused with what settles it; its second, after that refusal, is the honest unresolved ending.
    expect(step).toBe(2);
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "blocked" });
    expect(returns[0]!.reason).toContain("The reset completed. 1 act is still to undo: act-1 (press \"Confirm\" button).");
  });

  // A8 frozen pair 3 `run-mv9zn5ob-d929084d` (t645): a builder bound an output no step of its subflow made, one way after
  // another, and spent fourteen refusals before the repeat guard ended it. Two refusals of one output under different
  // bindings now end the brief blocked before a third submission, naming the output, with the plan's advice.
  it("ends a brief blocked once one output was refused under two different bindings, before a third submission", async () => {
    const OUTPUT = { id: "bedName", name: "Bed name", valueType: { kind: "unknown" as const } };
    const sent: string[] = [];
    const refusal = (code: string) => ({
      kind: "llm_evidence_tool_execution", effectApplied: false, targetsUnchanged: true, resultCode: "subflow.scope_refused:0a1b2c3d",
      evidence: { ok: false, revision: 0, issueCodes: [code], diagnostics: { ok: false, code: "subflow.scope_refused", issues: [{ code, path: "flow.output.bedName", message: `The output "bedName" is refused (${code}).` }] } }
    });
    const bindings = ["$step.read-bed.bedName", "$step.read-bed.text", "$step.read-bed.success"];
    const script: BuilderScript = async (input, seen) => {
      // The builder loop's own tools, wrapped by what the dispatcher observes, as the real loop wraps them.
      const own = { tools: [], decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => refusal("subflow.output_unknown_port") };
      const loop = input.observe!(own as unknown as AutomationStudioLlmEvidenceLoopInput);
      for (const [index, binding] of bindings.entries()) {
        // The real loop asks for no further decision once its signal is aborted.
        if (seen.signal.aborted) break;
        sent.push(binding);
        const flow = ["flow: Open the packet", "step: run subflow open_packet", "part open_packet: open the packet", `  output: bedName = ${binding}`, "  step read-bed: read the bed", "    node: web.dom.extract", "end"].join("\n");
        await loop.executeTool({ callId: `submit.${index}`, toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, value: { flow } } as Parameters<typeof loop.executeTool>[0]);
      }
      return { loop: { ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps: [], accounting: {} } as unknown as AutomationStudioSubflowBuilderOutcome["loop"], proposal: undefined, trial: undefined, promotionAllowed: false };
    };
    const build = await gardenBuild({
      capacity: 1,
      scripts: { "b-packet": script },
      briefs: async ({ store }) => {
        // The plan asks open_packet to hand on a value, as the run's plan asked its producer.
        const plan = structuredClone(gardenPlan());
        const packet = plan.plan.subflows.find((entry) => entry.key === "open_packet")!;
        packet.interface = { inputs: [...packet.interface!.inputs], outputs: [OUTPUT] };
        const { digest: _digest, ...fields } = plan;
        const asked = { ...fields, digest: automationStudioProjectStructurePlan.digest(fields) };
        await store.recordPlan(REF, asked);
        return [gardenBrief("b-packet", "open_packet", [], (value) => Object.assign(value, { planDigest: asked.digest, interface: structuredClone(packet.interface) }))];
      }
    });
    const { returns } = await build.run();
    expect(sent).toEqual(bindings.slice(0, 2));
    expect(returns[0], JSON.stringify(returns[0])).toMatchObject({ briefId: "b-packet", outcome: "blocked", unmadeOutput: "bedName" });
    expect(returns[0]!.reason).toContain("Core stopped this brief: core.submit_subflow refused output \"bedName\" under two different bindings (subflow.output_unknown_port)");
    expect(returns[0]!.reason).toContain("drop the value and keep the later subflow after this one");
    expect((await build.store.read(REF))!.returns[0]!.builderReturn).toEqual(returns[0]);
  });
});
