// A page fact's `{ handle }` target leaves bootstrap completion as the target
// the domain answers with, exactly as a step's does, and a plan still naming
// one is refused (t392). The domain is a stand-in: it issued two handles and
// answers a target as the parameters a step aimed at it would run with.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapFactCondition, AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID } from "../plan-fact-targets.ts";
import {
  AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES as CODES,
  assertAutomationStudioFlowBootstrapPlanHandlesResolved,
  resolveAutomationStudioFlowBootstrapPlanParameters
} from "../plan-parameter-resolution.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;
type Asked = Parameters<Resolver>[0];

const ISSUED: Record<string, JsonObject> = { t5: { selector: "#notice" }, t6: { selector: "#list", browserFrameId: 0 } };
const dialog = { kind: "dialog" as const, role: "alertdialog", name: "Please wait" };
const fact = (handle: string, op: "exists" | "absent" | "visible" = "exists"): AutomationStudioFlowBootstrapFactCondition => ({ fact: op, op, target: { handle } });

/** A Subflow with a success check, a step with an entry and a checkpoint, and a handler with a `when` and a completion check. */
function plan(handles: { success?: string; entry?: string; checkpoint?: string; when?: string } = {}): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
    subflows: [{
      key: "main",
      name: "Main",
      role: "primary",
      metadata: { "fluxiq.successCheck": [fact(handles.success ?? "t5", "absent")] },
      nodes: [
        { key: "s1", definitionId: "ledger.note", definitionVersion: "1.0.0", parameters: { text: "hi" } },
        {
          key: "s2", definitionId: "ledger.note", definitionVersion: "1.0.0", parameters: { text: "again" },
          metadata: {
            "fluxiq.entry": { id: "entry.1", order: 1, when: [fact(handles.entry ?? "t6", "visible")], requires: [] },
            "fluxiq.checkpoint": { id: "checkpoint.1", when: [{ fact: "text", op: "contains", value: "Due", target: { handle: handles.checkpoint ?? "t6" } }], requires: [] }
          }
        },
        {
          key: "h1-s1", definitionId: "builtin.control.handler", definitionVersion: "1.0.0",
          parameters: { event: "retry", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [{ fact: "exists", op: "exists", target: { handle: handles.when ?? "t5" } }], completionCheck: [{ fact: "dialog", op: "absent", target: dialog }], order: 1, maxRuns: 1 }
        }
      ],
      edges: []
    }]
  };
}

/** Answers a fact's target from what it issued, refuses one it never issued, and leaves every other node as written. */
function standIn(asked: Asked[], answer?: (input: Asked) => ReturnType<Resolver>): Resolver {
  return (input) => {
    // The permission check is a function, so it is kept by reference rather than cloned.
    asked.push({ ...structuredClone({ ...input, permission: undefined }), permission: input.permission });
    if (answer) return answer(input);
    if (input.nodeDefinitionId !== AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID) return { status: "unchanged" };
    const handle = (input.parameters.target as { handle: string }).handle;
    return ISSUED[handle] ? { status: "resolved", parameters: structuredClone(ISSUED[handle]!) } : { status: "refused", issueCodes: ["ledger.handle_unknown"] };
  };
}

async function resolve(input: AutomationStudioFlowBootstrapPlan, resolver?: Resolver, handlesIssued = true) {
  return resolveAutomationStudioFlowBootstrapPlanParameters({ plan: input, projectId: "project.ledger", flowId: "flow.notice", binding: resolver ? { resolvePlanNodeParameters: resolver } : undefined, handlesIssued });
}

describe("a page fact's handle", () => {
  it("is resolved in all five places, presented as a step's target, and leaves a dialog as written", async () => {
    const written = plan();
    const asked: Asked[] = [];
    const resolved = await resolve(written, standIn(asked));
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));

    const [main] = resolved.plan.subflows;
    expect(main!.metadata?.["fluxiq.successCheck"]).toEqual([{ fact: "absent", op: "absent", target: { selector: "#notice" } }]);
    expect(main!.nodes[1]!.metadata?.["fluxiq.entry"]?.when).toEqual([{ fact: "visible", op: "visible", target: { selector: "#list", browserFrameId: 0 } }]);
    expect(main!.nodes[1]!.metadata?.["fluxiq.checkpoint"]?.when).toEqual([{ fact: "text", op: "contains", value: "Due", target: { selector: "#list", browserFrameId: 0 } }]);
    expect(main!.nodes[2]!.parameters?.when).toEqual([{ fact: "exists", op: "exists", target: { selector: "#notice" } }]);
    expect(main!.nodes[2]!.parameters?.completionCheck).toEqual([{ fact: "dialog", op: "absent", target: dialog }]);
    // Each fact was asked about alone, as a step whose only parameter is its target, declaring it does nothing lasting:
    // the success check, the entry, the checkpoint, then the handler's `when`.
    const facts = asked.filter((input) => input.nodeDefinitionId === AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID);
    expect(facts.map((input) => input.parameters)).toEqual([{ target: { handle: "t5" } }, { target: { handle: "t6" } }, { target: { handle: "t6" } }, { target: { handle: "t5" } }]);
    expect(facts.every((input) => Array.isArray(input.declaredConsequences) && input.declaredConsequences.length === 0)).toBe(true);
    // The handler was asked about afterwards, with its facts already resolved.
    expect(asked.find((input) => input.nodeDefinitionId === "builtin.control.handler")?.parameters.when).toEqual([{ fact: "exists", op: "exists", target: { selector: "#notice" } }]);
    // Nothing the saved graph will carry names a handle; the plan handed in is unchanged.
    expect(() => assertAutomationStudioFlowBootstrapPlanHandlesResolved(resolved.plan)).not.toThrow();
    expect(written.subflows[0]!.metadata?.["fluxiq.successCheck"]).toEqual([fact("t5", "absent")]);
  });

  it("is refused at its own path when the domain never issued it, and a handler with one is not asked about again", async () => {
    const asked: Asked[] = [];
    const resolved = await resolve(plan({ entry: "t9", when: "t9" }), standIn(asked));
    expect(resolved).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({ code: "ledger.handle_unknown", path: "plan.subflows.0.nodes.1.metadata.fluxiq.entry.when.0.target" }),
        expect.objectContaining({ code: "ledger.handle_unknown", path: "plan.subflows.0.nodes.2.parameters.when.0.target" })
      ]
    });
    expect(asked.some((input) => input.nodeDefinitionId === "builtin.control.handler")).toBe(false);
  });

  it("is refused as a step's handle is: an answer leaving it in place, no domain to ask, and no exploration to have shown it", async () => {
    const unchanged = await resolve(plan(), standIn([], () => ({ status: "unchanged" })));
    expect(!unchanged.ok && unchanged.issues.map((issue) => issue.code)).toEqual([CODES.unresolved, CODES.unresolved, CODES.unresolved, CODES.unresolved]);
    const stillHandle = await resolve(plan(), standIn([], (input) => ({ status: "resolved", parameters: input.parameters })));
    expect(!stillHandle.ok && stillHandle.issues[0]?.code).toBe(CODES.unresolved);
    const unbound = await resolve(plan());
    expect(!unbound.ok && unbound.issues[0]?.code).toBe(CODES.unsupported);
    const unexplored = await resolve(plan(), standIn([]), false);
    expect(!unexplored.ok && unexplored.issues[0]?.code).toBe(CODES.notIssued);
  });

  // A hand-authored `exists at "<locator>"` fact compiles to `{ locator }` (t402): the host's own durable target, which
  // names no handle, so it is never put to the domain as a fact and leaves resolution exactly as written.
  it("leaves a locator target as written in all five places and never asks the domain about it", async () => {
    const located = plan();
    const [main] = located.subflows;
    const locator = (css: string) => ({ locator: css });
    main!.metadata = { "fluxiq.successCheck": [{ fact: "absent", op: "absent", target: locator("#notice") }] };
    const step = main!.nodes[1]!;
    step.metadata = {
      "fluxiq.entry": { id: "entry.1", order: 1, when: [{ fact: "visible", op: "visible", target: locator("main > ul.list") }], requires: [] },
      "fluxiq.checkpoint": { id: "checkpoint.1", when: [{ fact: "text", op: "contains", value: "Due", target: locator("[data-row='3']") }], requires: [] }
    };
    const handler = main!.nodes[2]!;
    handler.parameters = { ...handler.parameters, when: [{ fact: "exists", op: "exists", target: locator("#notice") }], completionCheck: [{ fact: "exists", op: "absent", target: locator(".spinner") }] };
    const written = structuredClone(located);
    const asked: Asked[] = [];
    const resolved = await resolve(located, standIn(asked));
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));

    expect(asked.some((input) => input.nodeDefinitionId === AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID)).toBe(false);
    expect(resolved.plan.subflows[0]!.metadata).toEqual(written.subflows[0]!.metadata);
    expect(resolved.plan.subflows[0]!.nodes[1]!.metadata).toEqual(written.subflows[0]!.nodes[1]!.metadata);
    expect(resolved.plan.subflows[0]!.nodes[2]!.parameters).toEqual(written.subflows[0]!.nodes[2]!.parameters);
    expect(() => assertAutomationStudioFlowBootstrapPlanHandlesResolved(resolved.plan)).not.toThrow();
    // Beside handles, only the handles are asked about: the success check's and the handler's, never a locator.
    const mixed = plan();
    mixed.subflows[0]!.nodes[1]!.metadata = structuredClone(step.metadata);
    const mixedAsked: Asked[] = [];
    const mixedResolved = await resolve(mixed, standIn(mixedAsked));
    if (!mixedResolved.ok) throw new Error(JSON.stringify(mixedResolved.issues));
    const facts = mixedAsked.filter((input) => input.nodeDefinitionId === AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID);
    expect(facts.map((input) => input.parameters)).toEqual([{ target: { handle: "t5" } }, { target: { handle: "t5" } }]);
    expect(mixedResolved.plan.subflows[0]!.nodes[1]!.metadata).toEqual(written.subflows[0]!.nodes[1]!.metadata);
  });

  it("refuses to apply a plan still naming one in node or Subflow metadata", () => {
    expect(() => assertAutomationStudioFlowBootstrapPlanHandlesResolved(plan())).toThrow(/plan\.subflows\.0\.metadata\.fluxiq\.successCheck\.0\.target .*plan\.subflows\.0\.nodes\.1\.metadata\.fluxiq\.entry\.when\.0\.target/u);
    const dialogsOnly = plan();
    dialogsOnly.subflows[0]!.metadata = { "fluxiq.successCheck": [{ fact: "dialog", op: "absent", target: dialog }] };
    dialogsOnly.subflows[0]!.nodes = dialogsOnly.subflows[0]!.nodes.slice(0, 1);
    expect(() => assertAutomationStudioFlowBootstrapPlanHandlesResolved(dialogsOnly)).not.toThrow();
  });
});
