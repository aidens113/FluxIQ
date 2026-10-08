// A candidate submission resolves its handles from exploration's whole view
// history, and records which view each came from (t358).
//
// Lane A round 4 (`run-muyrpbnk-fef374e7`, 0037-0068): twelve submissions were
// refused for `t478` and `t488`, the start page's welcome-popup controls, which
// the view before the popup closed had shown and the page as exploration last
// saw it no longer did. A Flow's first steps act on that start page. The
// submission now asks the domain for `view_history`; the receipt says which
// view each target was learned from, beside the candidate and never inside the
// stored draft; a handle no view printed is still refused, by name.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmEvidenceLoopDecision } from "../../../llm/evidence-loop.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop, AutomationStudioFlowCandidateSubmissionController } from "../index.ts";

const START = "https://farbazaar.test/";
const ITEM = "https://farbazaar.test/item/1005008123450";
const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
/** Where the stand-in domain's exploration saw each handle: the popup's on the start page's first view, the coupon on the item page. */
const SHOWN: Record<string, { view: number; location: string; selector: string }> = {
  t478: { view: 1, location: START, selector: "#welcome .close" },
  t488: { view: 1, location: START, selector: "#welcome .decline" },
  t925: { view: 4, location: ITEM, selector: "#store-coupon" }
};

/** A domain with a view history: it resolves a handle any view showed only when asked for `view_history`, as the web domain does. */
function domain(asked: (string | undefined)[]) {
  return {
    resolvePlanNodeParameters: async ({ parameters, handleReach }: { parameters: JsonObject; handleReach?: "view_history" | undefined }) => {
      asked.push(handleReach);
      const handle = String((parameters.target as JsonObject).handle);
      const shown = SHOWN[handle];
      const current = handle === "t925";
      if (shown === undefined || (!current && handleReach !== "view_history")) return { status: "refused" as const, issueCodes: ["web.handle.unknown", "web.handle.unknown:target"] };
      const resolved = { target: { selector: shown.selector } };
      return handleReach === "view_history"
        ? { status: "resolved" as const, parameters: resolved, handleViews: [{ handle, view: shown.view, location: shown.location }] }
        : { status: "resolved" as const, parameters: resolved };
    }
  };
}

function candidate(handles: string[]): JsonObject {
  const nodes = handles.map((handle, index) => ({ key: `n${index}`, definitionId: definition.id, definitionVersion: definition.version, parameters: { target: { handle } } }));
  const edges = nodes.slice(1).map((node, index) => ({ key: `e${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }));
  return { summary: "Close the popup and collect the coupon", plan: { schemaVersion: "0.1", router: { name: "Collect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }] } };
}

const submissionWith = (asked: (string | undefined)[]) => ({ projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding: domain(asked) });

describe("a candidate submission and exploration's view history", () => {
  it("validates a candidate naming start-page popup handles exploration has left, and records the view each target came from", async () => {
    const asked: (string | undefined)[] = [];
    const controller = new AutomationStudioFlowCandidateSubmissionController(submissionWith(asked));
    const submitted = await controller.submit(candidate(["t478", "t488", "t925"]));
    expect(submitted.ok, JSON.stringify(submitted)).toBe(true);
    if (!submitted.ok) return;
    expect(asked).toEqual(["view_history", "view_history", "view_history"]);
    expect(submitted.candidate.buildPlan.plan.subflows[0]!.nodes.map((node) => node.parameters)).toEqual([
      { target: { selector: "#welcome .close" } }, { target: { selector: "#welcome .decline" } }, { target: { selector: "#store-coupon" } }
    ]);
    expect(submitted.handleViews).toEqual([
      { node: "primary.n0", handle: "t478", view: 1, location: START },
      { node: "primary.n1", handle: "t488", view: 1, location: START },
      { node: "primary.n2", handle: "t925", view: 4, location: ITEM }
    ]);
    // Beside the candidate, never in it: the stored draft's candidate keys are unchanged.
    expect(Object.hasOwn(submitted.candidate, "handleViews")).toBe(false);
  });

  it("says in the receipt which view each target came from, and refuses a handle no view printed, by name", async () => {
    const decisions: AutomationStudioLlmEvidenceLoopDecision[] = [
      { kind: "tool_call", toolId: "demo.look", callId: "look", input: {} },
      { kind: "tool_call", toolId: "core.submit_candidate", callId: "submit.history", input: candidate(["t478", "t925"]) },
      { kind: "tool_call", toolId: "core.submit_candidate", callId: "submit.never", input: candidate(["t925", "t999"]) },
      { kind: "tool_call", toolId: "demo.look", callId: "look.again", input: {} }
    ];
    const seen: { toolId: string; value: unknown }[][] = [];
    let index = 0;
    await runAutomationStudioFlowCandidateAuthoringLoop({
      submission: submissionWith([]),
      loop: {
        tools: [{ toolId: "demo.look", effect: "observe", description: "Look", inputSchema: { type: "object" } }], maxIterations: decisions.length + 2, maxToolCalls: decisions.length + 2,
        unusableDecisions: { maxConsecutive: decisions.length + 2, maxInARow: decisions.length + 2, stalled: ({ issueCodes }) => Object.assign(new Error("stalled"), { issueCodes }) },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false, stateDigests: { before: "page.item", after: "page.item" } }),
        decide: async ({ evidence }) => {
          seen.push(evidence.map((entry) => ({ toolId: entry.toolId, value: entry.value })));
          const decision = decisions[index++];
          if (!decision) throw new Error("script exhausted");
          return decision;
        }
      }
    }).catch(() => undefined);
    const answers = (seen[decisions.length] ?? []).filter((entry) => entry.toolId === "core.submit_candidate").map((entry) => entry.value as JsonObject);
    expect(answers[0]).toMatchObject({ ok: true, handleViews: [
      { node: "primary.n0", handle: "t478", view: 1, location: START },
      { node: "primary.n1", handle: "t925", view: 4, location: ITEM }
    ] });
    expect(answers[1]).toMatchObject({ ok: false, issueCodes: expect.arrayContaining(["web.handle.unknown"]) });
    expect(String(answers[1]?.next)).toContain("t999");
    expect(String(answers[1]?.next)).toMatch(/any view this build was shown/);
    expect(String(answers[1]?.next)).not.toContain("t925");
  });
});
