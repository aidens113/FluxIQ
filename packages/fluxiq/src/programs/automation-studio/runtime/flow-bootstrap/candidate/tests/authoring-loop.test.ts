import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop, AutomationStudioFlowCandidateSubmissionController } from "../index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
function result(text = "reusable criterion"): JsonObject {
  return { summary: "Inspect selected values", plan: { schemaVersion: "0.1", router: { name: "Inspect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
    { key: "first", definitionId: definition.id, definitionVersion: definition.version, parameters: { text } },
    { key: "second", definitionId: definition.id, definitionVersion: definition.version, parameters: { text: "read outcome" } }
  ], edges: [{ key: "next", source: { nodeKey: "first", portId: "success" }, target: { nodeKey: "second", portId: "in" } }] }] } };
}
const submission = { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base" };

describe("explicit candidate authoring", () => {
  it("tests an accepted receipt with one cost-counted decision left before completing", async () => {
    let receipt: JsonObject = {};
    let trialCalls = 0;
    const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({ submission,
      trial: { candidateId: "candidate.last-budget", port: async (request) => {
        trialCalls += 1;
        expect(request.revision).toBe(receipt.revision);
        expect(request.digest).toBe(receipt.digest);
        return { revision: request.revision, digest: request.digest, verdict: "yes", feedback: {} };
      } },
      loop: {
        tools: [], maxIterations: 6, maxToolCalls: 6, budget: { maxCostUsd: 0.1 },
        executeTool: async () => ({}),
        decide: async ({ iteration, tools, evidence }) => {
          if (iteration === 1) return { kind: "tool_call", toolId: "core.submit_candidate", callId: "submit", input: result(), usage: { totalTokens: 100, estimatedCostUsd: 0.06 } };
          receipt = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")!.value as JsonObject;
          expect(receipt.next).toBe(`Test next with core.test_candidate using exactly {"revision": ${receipt.revision}, "digest": "${receipt.digest}"}. Do not complete until that exact revision's trial answers yes. Submitting again makes a new revision that needs its own trial.`);
          if (iteration === 2) {
            expect(evidence.at(-1)?.value).toMatchObject({ decisionsLeft: 1 });
            expect(tools.map((tool) => tool.toolId)).toContain("core.test_candidate");
            return { kind: "tool_call", toolId: "core.test_candidate", callId: "test", input: { revision: receipt.revision, digest: receipt.digest }, usage: { totalTokens: 100, estimatedCostUsd: 0.005 } };
          }
          return { kind: "complete", result: { revision: receipt.revision, digest: receipt.digest }, usage: { totalTokens: 100, estimatedCostUsd: 0.005 } };
        }
      }
    });
    expect(trialCalls).toBe(1);
    expect(outcome.loop.ok).toBe(true);
    expect(outcome.trial?.verdict).toBe("yes");
  });

  it("records discovery evidence, omits a wrong turn, submits and revises without draft grammar", async () => {
    let receipt: JsonObject = {};
    const seen: string[] = [];
    const acceptedFlow = { graph: "unchanged" };
    const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({ submission, loop: {
      tools: [{ toolId: "demo.explore", effect: "mutate", description: "Explore", inputSchema: { type: "object" } }], maxIterations: 6, maxToolCalls: 6,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { wrongTurn: "irrelevant item" }, effectApplied: true }),
      decide: async ({ iteration, evidence, decisionSchema }) => {
        const schema = JSON.stringify(decisionSchema);
        expect(schema).not.toContain("amend_draft");
        expect(schema).not.toContain('"add"');
        seen.push(...evidence.map((entry) => entry.toolId));
        if (iteration === 1) return { kind: "tool_call", toolId: "demo.explore", callId: "wrong", input: {} };
        if (iteration === 2 || iteration === 3) return { kind: "tool_call", toolId: "core.submit_candidate", callId: `submit.${iteration}`, input: result(iteration === 2 ? "first criterion" : "reusable criterion") };
        receipt = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")!.value as JsonObject;
        return { kind: "complete", result: { revision: receipt.revision, digest: receipt.digest } };
      }
    } });
    expect(outcome.loop.ok).toBe(true);
    expect(outcome.loop.steps).toEqual([]);
    expect(seen).toContain("demo.explore");
    expect(outcome.candidate).toMatchObject({ revision: 2, status: "draft" });
    expect(outcome.candidate?.changedPaths).toContain("plan.subflows.0.nodes.0.parameters.text");
    expect(JSON.stringify(outcome.candidate)).not.toContain("irrelevant item");
    expect(outcome.candidate?.buildPlan.plan.subflows[0]?.nodes).toHaveLength(2);
    expect(outcome.promotionAllowed).toBe(false);
    expect(acceptedFlow).toEqual({ graph: "unchanged" });
  });

  it("invalidates prior receipts on any submission, including a refused revision", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const first = await controller.submit(result());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(controller.matches(first.candidate)).toBe(true);
    const invalid = result();
    ((invalid.plan as JsonObject).subflows as JsonObject[])[0]!.nodes = [{ key: "unknown", definitionId: "missing.node", definitionVersion: "1.0.0" }];
    const refused = await controller.submit(invalid);
    expect(refused.ok).toBe(false);
    expect(controller.latest()).toBeUndefined();
    expect(controller.matches(first.candidate)).toBe(false);
    const next = await controller.submit(result());
    expect(next.ok && next.candidate.revision).toBe(3);
    expect(controller.matches(first.candidate)).toBe(false);
  });

  it("rejects stale and unresolved handles and collects registry/parameter diagnostics", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController({ ...submission, binding: {
      resolvePlanNodeParameters: async ({ parameters }) => typeof parameters.text === "object" ? { status: "refused", issueCodes: ["target.handle_stale"] } : { status: "unchanged" }
    } });
    const candidate = result();
    const nodes = ((candidate.plan as JsonObject).subflows as JsonObject[])[0]!.nodes as JsonObject[];
    nodes[0]!.parameters = { text: { handle: "stale" } };
    const refused = await controller.submit(candidate);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.check.issueCodes.join(" ")).toContain("target.handle_stale");
  });

  it("cannot publish a candidate returned after cancellation", async () => {
    const abort = new AbortController();
    const controller = new AutomationStudioFlowCandidateSubmissionController({ ...submission, signal: abort.signal, binding: {
      resolvePlanNodeParameters: async () => { abort.abort(); return { status: "unchanged" }; }
    } });
    await expect(controller.submit(result())).rejects.toThrow();
    expect(controller.latest()).toBeUndefined();
  });
});

it("resolves issued handles to reusable parameters, never retaining the handle", async () => {
  const controller = new AutomationStudioFlowCandidateSubmissionController({ ...submission, binding: {
    resolvePlanNodeParameters: async ({ parameters }) => ({ status: "resolved", parameters: { ...parameters, text: "reusable locator description" } })
  } });
  const candidate = result();
  const nodes = ((candidate.plan as JsonObject).subflows as JsonObject[])[0]!.nodes as JsonObject[];
  nodes[0]!.parameters = { text: { handle: "issued.target" } };
  const accepted = await controller.submit(candidate);
  expect(accepted.ok).toBe(true);
  if (accepted.ok) {
    expect(JSON.stringify(accepted.candidate)).not.toContain("issued.target");
    expect(accepted.candidate.buildPlan.plan.subflows[0]?.nodes[0]?.parameters?.text).toBe("reusable locator description");
  }
});

it("rejects out-of-scope nodes, malformed bindings and missing permissions", async () => {
  const outside = new AutomationStudioFlowCandidateSubmissionController({ ...submission, resolution: { ...resolution, scope: { kind: "domain", domainId: "other" } } });
  expect((await outside.submit(result())).ok).toBe(false);
  const bound = result();
  const nodes = ((bound.plan as JsonObject).subflows as JsonObject[])[0]!.nodes as JsonObject[];
  nodes[0]!.parameters = { text: { $state: { path: "" } } };
  expect((await new AutomationStudioFlowCandidateSubmissionController(submission).submit(bound)).ok).toBe(false);
  const denied = new AutomationStudioFlowCandidateSubmissionController({ ...submission, binding: {
    resolvePlanNodeParameters: async () => ({ status: "needs_permission", missing: ["send_or_publish"], requestId: "request.permission" })
  } });
  const receipt = await denied.submit(result());
  expect(receipt.ok).toBe(false);
  if (!receipt.ok) expect(receipt.check.issueCodes.join(" ")).toContain("bootstrap.step_permission_required");
});

it("protects canonical candidate snapshots and receipt base identity", async () => {
  const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
  const first = await controller.submit(result());
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  first.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.parameters = { text: "tampered" };
  expect(controller.latest()?.buildPlan.plan.subflows[0]?.nodes[0]?.parameters?.text).toBe("reusable criterion");
  expect(controller.matches({ ...first.candidate, baseDependencyDigest: "changed.accepted.base" })).toBe(false);
});

// Lane C (`run-mv0pa79q-ef91811b`) never submitted a Flow and completed four times with an invented revision and
// digest; each refusal said only "Submit a valid complete candidate", never that nothing had been submitted.
describe("a completion the loop refuses says why", () => {
  type Entry = { toolId: string; value: unknown };
  async function completions(decisions: Array<(evidence: readonly Entry[]) => ReturnType<NonNullable<Parameters<typeof runAutomationStudioFlowCandidateAuthoringLoop>[0]["loop"]["decide"]>>>) {
    const seen: Entry[][] = [];
    let stalledCodes: readonly string[] | undefined;
    let index = 0;
    await runAutomationStudioFlowCandidateAuthoringLoop({ submission, loop: {
      tools: [{ toolId: "demo.look", effect: "observe", description: "Look", inputSchema: { type: "object" } }], maxIterations: decisions.length + 1, maxToolCalls: decisions.length + 1,
      unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: ({ issueCodes }) => {
        stalledCodes = issueCodes;
        return new Error("stalled");
      } },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false }),
      decide: async ({ evidence }) => {
        seen.push(evidence.map((entry) => ({ ...entry })));
        const next = decisions[index++];
        if (!next) throw new Error("script exhausted");
        return next(evidence);
      }
    } }).catch(() => undefined);
    const feedback = seen.map((evidence) => [...evidence].reverse().find((entry) => entry.toolId === "core.completion_check")?.value as JsonObject | undefined);
    return { feedback, stalledCodes: () => stalledCodes };
  }
  const look = async () => ({ kind: "tool_call" as const, toolId: "demo.look", callId: "look", input: {} });
  const invented = async () => ({ kind: "complete" as const, result: { revision: 1, digest: "f".repeat(64) } });

  it("with nothing submitted: says no Flow was submitted, names the submit tool, and never offers a revision", async () => {
    const { feedback, stalledCodes } = await completions([look, invented, invented, invented, invented]);
    const told = feedback[2]!;
    expect(told).toMatchObject({ code: "candidate.latest_submission_required", submitted: false });
    expect(String(told.instruction)).toMatch(/^No Flow has been submitted yet/u);
    expect(String(told.instruction)).toContain("core.submit_candidate");
    expect(String(told.instruction)).toMatch(/never invent/u);
    expect(told).not.toHaveProperty("revision");
    // No trial runner here, so it is not told to test with one.
    expect(String(told.instruction)).not.toContain("core.test_candidate");
    // The stall carries the code the build's ending reads (`../../../conversations/commands/progress.ts`).
    expect(stalledCodes()).toContain("candidate.latest_submission_required");
  });

  it("with a submission: names the latest revision and digest to complete with", async () => {
    let receipt: JsonObject = {};
    const submit = async () => ({ kind: "tool_call" as const, toolId: "core.submit_candidate", callId: "submit", input: result() });
    const keep = async (evidence: readonly Entry[]) => {
      receipt = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")!.value as JsonObject;
      return invented();
    };
    const { feedback } = await completions([look, submit, keep, invented]);
    const told = feedback[3]!;
    expect(receipt).toMatchObject({ ok: true, revision: 1 });
    expect(told).toMatchObject({ code: "candidate.latest_submission_required", submitted: true, revision: receipt.revision, digest: receipt.digest });
    expect(String(told.instruction)).toContain(`{"revision": ${String(receipt.revision)}, "digest": "${String(receipt.digest)}"}`);
    expect(String(told.instruction)).not.toMatch(/No Flow has been submitted/u);
  });
});
