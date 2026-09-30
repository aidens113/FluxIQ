import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowDraftSeedFromFlow } from "../../node-tools/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";

// `run-munnhi5q-4867dabe`: a refuted answer was re-authored from the Flow it
// ran, and every completion was refused `web.step.consequences_undeclared` for
// the presses the Flow already had (Accept, Go, Continue shopping), which the
// seed carries with no declaration and the model never wrote. These are the
// same checks the build runs, over a draft seeded the way the build seeds it,
// against a binding that refuses exactly as the web domain does.

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const NAVIGATE = "web.output.browser-navigate";
const CLICK = "web.output.dom-click";
const EXTRACT = "web.output.dom-extract_list";
const extractList = { item: "li.product", fields: { name: ".name", url: "a@href" } };

/** The web domain's rule, as `step-permission.ts` holds it: a press must declare, and a declared class is put to the person. */
function webLikeBinding() {
  const asked: string[] = [];
  return {
    asked,
    binding: {
      resolvePlanNodeParameters: (input: { nodeDefinitionId: string; declaredConsequences?: readonly string[] | undefined }) => {
        asked.push(input.nodeDefinitionId);
        if (input.nodeDefinitionId !== CLICK) return { status: "unchanged" as const };
        if (input.declaredConsequences === undefined) return { status: "refused" as const, issueCodes: ["web.step.consequences_undeclared", "web.step.expected.consequences_classes_or_none"] };
        return input.declaredConsequences.length
          ? { status: "needs_permission" as const, missing: [...input.declaredConsequences], requestId: null }
          : { status: "unchanged" as const };
      }
    }
  };
}

/** navigate -> press Accept -> extract: a read-only Flow with one press in it. */
function seededDraft(): AutomationStudioFlowDraftStep[] {
  const node = (id: string, definitionId: string, parameterValues: NonNullable<AutomationStudioFlowNode["parameterValues"]>): AutomationStudioFlowNode => ({ id, definitionId, parameterValues });
  const edge = (id: string, sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge => ({ id, sourceNodeId, targetNodeId });
  return automationStudioFlowDraftSeedFromFlow({
    nodes: [
      node("node.navigate", NAVIGATE, { url: "https://shop.test/" }),
      node("node.accept", CLICK, { selector: "#accept", element: { tagName: "button", accessibleName: "Accept" } }),
      node("node.extract", EXTRACT, { extractList })
    ],
    edges: [edge("edge.1", "node.navigate", "node.accept"), edge("edge.2", "node.accept", "node.extract")]
  }).steps;
}

/** A press the build itself took, through the library verb, as the loop appends it. */
function pressTheBuildTook(position: number, consequences?: string[]): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: 3, callId: `call.${position}`, actionId: CLICK, toolId: "core.run_node",
    input: { node: CLICK, parameters: { selector: "#place-order" }, ...(consequences ? { consequences } : {}) },
    effect: "mutate", effectApplied: true, proposes: true, disposition: "kept"
  };
}

async function complete(draftSteps: AutomationStudioFlowDraftStep[], binding: ReturnType<typeof webLikeBinding>["binding"], summary = "Read the products") {
  return await checkAutomationStudioFlowBootstrapCompletion({ result: { summary }, projectId: "project.1", flowId: "flow.1", registry, resolution, binding, draftSteps });
}

describe("a re-author's completion, over the Flow it inherited", () => {
  it("builds a read-only Flow whose press the build inherited and left alone, without asking it to declare", async () => {
    const { binding, asked } = webLikeBinding();
    // The re-author's summary runs long, as the repair brief invites; the draft
    // path bounds it rather than refusing the Flow for it.
    const verdict = await complete(seededDraft(), binding, "Search the catalog for wireless earbuds, keep only Plus items rated 4.0 or better under $50, drop sponsored results and accessories, dedupe by url in search order and save one record set. ".repeat(2));

    expect(verdict.ok ? [] : verdict.check.issueCodes).toEqual([]);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.buildPlan.plan.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual([NAVIGATE, CLICK, EXTRACT]);
    // Every step was inherited as it stands, with the Flow's own resolved
    // parameters, so none was put to the domain again -- the press included.
    expect(asked).toEqual([]);
  });

  it("finds the inherited press by the step it came from when routing has added a join before it", async () => {
    const { binding, asked } = webLikeBinding();
    const draft = seededDraft();
    draft[0] = { ...draft[0]!, routing: { kind: "optional" } };
    const verdict = await complete(draft, binding);

    expect(verdict.ok ? [] : verdict.check.issueCodes).toEqual([]);
    if (!verdict.ok) return;
    expect(verdict.buildPlan.plan.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual([NAVIGATE, "builtin.control.merge", CLICK, EXTRACT]);
    expect(asked).not.toContain(CLICK);
  });

  it("still refuses a press the build took itself and did not declare", async () => {
    const { binding } = webLikeBinding();
    const verdict = await complete([...seededDraft(), pressTheBuildTook(4)], binding);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.check.issueCodes).toEqual(["web.step.consequences_undeclared", "web.step.expected.consequences_classes_or_none"]);
    // Only the new press: the inherited one is at node 1, the build's own at node 3.
    expect(verdict.issues.map((item) => item.path)).toEqual(["plan.subflows.0.nodes.3.parameters", "plan.subflows.0.nodes.3.parameters"]);
  });

  it("still puts a press that declares a lasting consequence to the person", async () => {
    const { binding } = webLikeBinding();
    const verdict = await complete([...seededDraft(), pressTheBuildTook(4, ["move_money"])], binding);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.check.issueCodes).toEqual(["bootstrap.step_permission_required"]);
  });

  it("gates an inherited press again once the build changed it", async () => {
    const { binding } = webLikeBinding();
    const draft = seededDraft();
    draft[1] = { ...draft[1]!, settings: { selector: "#checkout" } };
    const verdict = await complete(draft, binding);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.check.issueCodes).toContain("web.step.consequences_undeclared");
  });
});
