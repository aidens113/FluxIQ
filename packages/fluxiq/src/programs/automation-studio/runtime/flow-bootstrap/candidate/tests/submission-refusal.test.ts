import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopDecision } from "../../../llm/evidence-loop.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop, AutomationStudioFlowCandidateSubmissionController } from "../index.ts";

// Lane A round 4 (`run-muyrpbnk-fef374e7`, 0037-0068): twelve submissions refused for the same two start-page handles,
// each refusal naming neither the handles nor a way out, until the no-progress guard stopped the build eight refusals
// later. A refused submission now names its handles and the recovery, and the same refusal three decisions in a row
// ends the round (`../submission-refusal.ts`).

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }, { id: "note", label: "Note", valueType: "string" }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
/** Every handle but `t925` is unknown, as the start page's `t478` was to a script that opens the item page. */
const binding = {
  resolvePlanNodeParameters: async ({ parameters }: { parameters: JsonObject }) => {
    const handle = (parameters.target as JsonObject | undefined)?.handle;
    return handle === "t925"
      ? { status: "resolved" as const, parameters: { ...parameters, target: { selector: "#coupon", visibleText: "Get coupons" } } }
      : { status: "refused" as const, issueCodes: ["web.handle.unknown", "web.handle.unknown:target"] };
  }
};
const submission = { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding };

function candidate(handles: string[], note = "first"): JsonObject {
  const nodes = handles.map((handle, index) => ({ key: `n${index}`, definitionId: definition.id, definitionVersion: definition.version, parameters: { target: { handle }, note } }));
  const edges = nodes.slice(1).map((node, index) => ({ key: `e${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }));
  return { summary: "Collect the coupon", plan: { schemaVersion: "0.1", router: { name: "Collect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }] } };
}

type Entry = { callId: string; toolId: string; value: unknown };
const latestOf = (toolId: string, evidence: readonly Entry[]) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;

async function run(decisions: AutomationStudioLlmEvidenceLoopDecision[]) {
  const seen: Entry[][] = [];
  let index = 0;
  const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission,
    loop: {
      tools: [{ toolId: "demo.look", effect: "observe", description: "Look", inputSchema: { type: "object" } }], maxIterations: decisions.length + 2, maxToolCalls: decisions.length + 2,
      unusableDecisions: { maxConsecutive: decisions.length + 2, maxInARow: decisions.length + 2, stalled: ({ issueCodes }) => Object.assign(new Error("stalled"), { issueCodes }) },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false, stateDigests: { before: "page.item", after: "page.item" } }),
      decide: async ({ evidence }) => {
        seen.push(evidence.map((entry) => ({ ...entry })));
        const decision = decisions[index++];
        if (!decision) throw new Error("script exhausted");
        return decision;
      }
    }
  }).then((value) => ({ value }), (error: unknown) => ({ error }));
  return { outcome, seen, decided: () => index };
}
const submit = (handles: string[], note: string): AutomationStudioLlmEvidenceLoopDecision => ({ kind: "tool_call", toolId: "core.submit_candidate", callId: `submit.${note}`, input: candidate(handles, note) });
const look: AutomationStudioLlmEvidenceLoopDecision = { kind: "tool_call", toolId: "demo.look", callId: "look", input: {} };

describe("a refused candidate submission", () => {
  it("names each refused handle and says how to get one that works", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const refused = await controller.submit(candidate(["t925", "t478", "t488"]));
    expect(refused.ok).toBe(false);
    const { seen } = await run([look, submit(["t925", "t478", "t488"], "first"), look]);
    const answer = latestOf("core.submit_candidate", seen[2]!);
    expect(answer).toMatchObject({ ok: false, issueCodes: expect.arrayContaining(["web.handle.unknown"]) });
    const issues = (answer?.diagnostics as JsonObject).issues as JsonObject[];
    expect(issues.filter((issue) => issue.path === "plan.subflows.0.nodes.1.parameters").every((issue) => JSON.stringify(issue.handles) === JSON.stringify([{ handle: "t478" }]))).toBe(true);
    expect(issues.filter((issue) => issue.path === "plan.subflows.0.nodes.2.parameters").every((issue) => JSON.stringify(issue.handles) === JSON.stringify([{ handle: "t488" }]))).toBe(true);
    expect(String(answer?.next)).toContain("t478, t488");
    expect(String(answer?.next)).toMatch(/look at that page/);
    expect(String(answer?.next)).toMatch(/drop it/);
  });

  it("ends the round at the third refusal for the same reason in a row, warned at the second, instead of spending the purse", async () => {
    const decisions = [look, submit(["t925", "t478"], "one"), submit(["t925", "t478"], "two"), submit(["t925", "t478"], "three"), submit(["t925", "t478"], "four"), submit(["t925", "t478"], "five")];
    const { outcome, seen, decided } = await run(decisions);
    // Three refused submissions and no fourth decision: the round ended as a stall, not on the purse or the no-progress guard.
    expect(decided()).toBe(4);
    expect("value" in outcome && outcome.value.loop).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    const warning = latestOf("core.refusal_run", seen[3]!);
    // The same refusal is one of the same issues: it is counted under the category and a digest of its codes and
    // places (t378), but the warning the model reads names the category only, never the digest.
    expect(warning).toMatchObject({ code: "llm_evidence_loop.refused_in_a_row", refusal: "call:flow_bootstrap.evidence_completion_parameters_unresolved", inARow: 2 });
  });

  it("does not end the round when the refusals differ, or when a valid submission comes between", async () => {
    const decisions = [look, submit(["t478"], "one"), submit(["t925"], "valid"), submit(["t478"], "two"), submit(["t478"], "three"), look];
    const { outcome, seen, decided } = await run(decisions);
    // Every scripted decision was asked for, and one more after them: nothing ended the round early.
    expect(decided()).toBe(decisions.length + 1);
    expect("value" in outcome && !outcome.value.loop.ok && outcome.value.loop.code).not.toBe("llm_evidence_loop.repeat_without_progress");
    expect(latestOf("core.submit_candidate", seen[3]!)).toMatchObject({ ok: true, revision: 2 });
  });
});
