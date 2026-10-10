// A plan the model wrote names every element by handle, or is refused (t432;
// user, 2026-10-10: the model names elements by the handles the page view
// printed, and the rest "is all handled by extension").
//
// Core's half: a caller whose plan is the model's own says so, and Core hands
// that to the domain with every node and every fact, and refuses itself a fact
// whose target is a locator -- Core's own `at "<locator>"` form, which only a
// hand-authored Flow may write -- or anything else that is not a handle or a
// dialog. A plan the host wrote (a draft, a hand-authored Flow) is not flagged,
// and its locator facts stand. The domain is a stand-in with no web words.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapFactCondition, AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";
import { AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID, automationStudioPlanFactTargetsNotNamingHandles } from "../plan-fact-targets.ts";
import { AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES as CODES, resolveAutomationStudioFlowBootstrapPlanParameters } from "../plan-parameter-resolution.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;
type Asked = Parameters<Resolver>[0];

const dialog = { kind: "dialog" as const, role: "alertdialog", name: "Slow down" };

/** A Subflow whose success check is `success`, and a handler whose `when` is `when` and whose completion check names a dialog. */
function plan(success: AutomationStudioFlowBootstrapFactCondition, when: AutomationStudioFlowBootstrapFactCondition): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
    subflows: [{
      key: "main",
      name: "Main",
      role: "primary",
      metadata: { "fluxiq.successCheck": [success] },
      nodes: [
        { key: "s1", definitionId: "ledger.note", definitionVersion: "1.0.0", parameters: { text: "hi" } },
        {
          key: "h1", definitionId: "builtin.control.handler", definitionVersion: "1.0.0",
          parameters: { event: "retry", scope: { kind: "nodes", nodeIds: ["s1"] }, when: [when], completionCheck: [{ fact: "dialog", op: "absent", target: dialog }], order: 1, maxRuns: 1 }
        }
      ],
      edges: []
    }]
  };
}

const byHandle = (handle: string): AutomationStudioFlowBootstrapFactCondition => ({ fact: "exists", op: "exists", target: { handle } });
const byLocator = (locator: string): AutomationStudioFlowBootstrapFactCondition => ({ fact: "exists", op: "exists", target: { locator } });

/** Records every question and answers a fact's handle as resolved; every other node is unchanged. */
function standIn(asked: Asked[]): Resolver {
  return (input) => {
    asked.push({ ...structuredClone({ ...input, permission: undefined }), permission: input.permission });
    if (input.nodeDefinitionId !== AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID) return { status: "unchanged" };
    return { status: "resolved", parameters: { address: "ledger://notice" } };
  };
}

async function resolve(input: AutomationStudioFlowBootstrapPlan, resolver: Resolver, writtenByModel?: boolean) {
  return resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: input, projectId: "project.ledger", flowId: "flow.notice", binding: { resolvePlanNodeParameters: resolver }, handlesIssued: true,
    ...(writtenByModel === undefined ? {} : { writtenByModel })
  });
}

describe("a plan the model wrote", () => {
  it("is handed to the domain as the model's writing, node by node and fact by fact", async () => {
    const asked: Asked[] = [];
    const resolved = await resolve(plan(byHandle("t5"), byHandle("t6")), standIn(asked), true);
    expect(resolved.ok).toBe(true);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((input) => input.writtenByModel === true)).toBe(true);
  });

  it("is refused at each fact that names its element by a locator, with Core's sentence saying to name it by its handle", async () => {
    const asked: Asked[] = [];
    const resolved = await resolve(plan(byLocator("#banner"), byLocator("[data-gone]")), standIn(asked), true);
    if (resolved.ok) throw new Error("a locator fact the model wrote was accepted");
    const refusals = resolved.issues.filter((issue) => issue.code === CODES.notAHandle);
    expect(refusals.map((issue) => issue.path)).toEqual([
      "plan.subflows.0.metadata.fluxiq.successCheck.0.target",
      "plan.subflows.0.nodes.1.parameters.when.0.target"
    ]);
    for (const issue of refusals) {
      expect(issue.message).toContain("handle the evidence printed");
      expect(issue.message).not.toMatch(/\b(?:locators?|selectors?|css|xpath)\b/iu);
    }
  });

  it("is refused for any fact target that is neither a handle nor a dialog, and a dialog fact stands", () => {
    const written = plan({ fact: "exists", op: "exists", target: { address: "#banner" } }, byHandle("t6"));
    expect(automationStudioPlanFactTargetsNotNamingHandles(written)).toEqual([{ path: "plan.subflows.0.metadata.fluxiq.successCheck.0.target", ref: "main" }]);
  });
});

describe("a plan the host wrote", () => {
  it("is not flagged, and a hand-authored locator fact stands as written", async () => {
    const asked: Asked[] = [];
    const resolved = await resolve(plan(byLocator("#banner"), byHandle("t6")), standIn(asked));
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));
    expect(resolved.plan.subflows[0]!.metadata?.["fluxiq.successCheck"]).toEqual([byLocator("#banner")]);
    expect(asked.some((input) => Object.hasOwn(input, "writtenByModel"))).toBe(false);
  });

  // An amendment's settings over a draft step are the model's writing (`../amended-plan-parameters.ts`).
  it("names to the domain only the parameters an amendment wrote, and refuses a locator fact in one of them, not in the rest", async () => {
    const step = (key: string, expectedState: JsonObject): AutomationStudioFlowBootstrapPlan["subflows"][number]["nodes"][number] =>
      ({ key, definitionId: "ledger.press", definitionVersion: "1.0.0", parameters: { address: "ledger://saved", expectedState } });
    const written: AutomationStudioFlowBootstrapPlan = {
      schemaVersion: "0.1",
      router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
      subflows: [{ key: "main", name: "Main", role: "primary", nodes: [step("amended", { facts: [byLocator("#typed")] }), step("saved", { facts: [{ fact: "exists", op: "exists", target: { address: "ledger://done" } }] })], edges: [] }]
    };
    const asked: Asked[] = [];
    const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({
      plan: written, projectId: "project.ledger", flowId: "flow.notice", binding: { resolvePlanNodeParameters: standIn(asked) }, handlesIssued: true,
      modelWrittenParameters: new Map([["main.amended", ["expectedState"]]])
    });
    if (resolved.ok) throw new Error("a locator fact an amendment wrote was accepted");
    expect(resolved.issues.map((issue) => [issue.code, issue.path])).toEqual([[CODES.notAHandle, "plan.subflows.0.nodes.0.parameters.expectedState.facts.0.target"]]);
    // The node the amendment wrote over is named to the domain with that parameter alone; the saved one with nothing.
    expect(asked.find((input) => input.parameters.address === "ledger://saved" && input.modelWrittenParameters)?.modelWrittenParameters).toEqual(["expectedState"]);
    expect(asked.filter((input) => Object.hasOwn(input, "writtenByModel"))).toEqual([]);
    expect(asked.filter((input) => Object.hasOwn(input, "modelWrittenParameters"))).toHaveLength(1);
  });
});

describe("a completion check", () => {
  const press: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "target", label: "Target", valueType: "object" }, { id: "address", label: "Address", valueType: "string", shownToModel: false }, { id: "wait", label: "Wait", valueType: "object" }]
  };
  const registry = new AutomationStudioNodeRegistry([press]);
  const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
  const pressPlan = (parameters: JsonObject): JsonObject => ({
    schemaVersion: "0.1", router: { name: "Press", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "n0", definitionId: press.id, definitionVersion: press.version, parameters, consequences: [] }], edges: [] }]
  });
  const recording = (asked: Asked[]): Resolver => (input) => {
    asked.push({ ...structuredClone({ ...input, permission: undefined }), permission: input.permission });
    return { status: "unchanged" };
  };

  it("tells the domain a plan from the reply is the model's writing", async () => {
    const asked: Asked[] = [];
    await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Press the button", plan: pressPlan({ target: { handle: "t5" } }) },
      projectId: "project.demo", flowId: "flow.demo", registry, resolution, binding: { resolvePlanNodeParameters: recording(asked) }
    });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((input) => input.writtenByModel === true)).toBe(true);
  });

  it("does not, for a plan built from the draft, whose steps ran with what the domain resolved", async () => {
    const asked: Asked[] = [];
    const ran: AutomationStudioFlowDraftStep = {
      position: 1, id: "d1", iteration: 1, actionId: press.id, toolId: "core.run_node",
      input: { node: press.id, parameters: { target: { handle: "t5" } }, consequences: [] },
      ranWith: { node: press.id, parameters: { address: "demo://button/5" }, consequences: [] },
      effect: "mutate", effectApplied: true, disposition: "kept"
    };
    await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Press the button" }, projectId: "project.demo", flowId: "flow.demo", registry, resolution,
      draftSteps: [ran], binding: { resolvePlanNodeParameters: recording(asked) }
    });
    expect(asked.map((input) => input.parameters)).toEqual([{ address: "demo://button/5" }]);
    expect(asked.some((input) => Object.hasOwn(input, "writtenByModel"))).toBe(false);
    expect(asked.some((input) => Object.hasOwn(input, "modelWrittenParameters"))).toBe(false);
  });

  it("names the parameters an amendment wrote onto a draft step, which are the model's own (amend_draft settings)", async () => {
    const asked: Asked[] = [];
    const amended: AutomationStudioFlowDraftStep = {
      position: 1, id: "d1", iteration: 1, actionId: press.id, toolId: "core.run_node",
      input: { node: press.id, parameters: { target: { handle: "t5" } }, consequences: [] },
      ranWith: { node: press.id, parameters: { address: "demo://button/5" }, consequences: [] },
      settings: { wait: { condition: "visible" } },
      effect: "mutate", effectApplied: true, disposition: "kept"
    };
    await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Press the button" }, projectId: "project.demo", flowId: "flow.demo", registry, resolution,
      draftSteps: [amended], binding: { resolvePlanNodeParameters: recording(asked) }
    });
    expect(asked.map((input) => [input.parameters, input.modelWrittenParameters])).toEqual([[{ address: "demo://button/5", wait: { condition: "visible" } }, ["wait"]]]);
    expect(asked.some((input) => Object.hasOwn(input, "writtenByModel"))).toBe(false);
  });
});
