// Provider-free shapes from the F26 campaign. No recorded page content.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../../framework/automation-service/nodes/index.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../../../bootstrap/authoring/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../bootstrap/plan/tests/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../step.ts";
import { applyAutomationStudioFlowDraftAmendments, type AutomationStudioFlowDraftAmendment } from "../index.ts";

const definitions = webDomainNodeDefinitionsFixture();
const click = definitions.find((definition) => definition.id === "web.output.dom-click")!;
const registry = new AutomationStudioNodeRegistry();
for (const definition of definitions) registry.register(definition);
registry.register({
  ...click, id: "test.advance", label: "Advance", description: "Advance or answer ended.",
  source: { kind: "importer", domainId: "web-automation", packageId: "test", implementationKey: "test.advance" },
  outputAction: { fixedOutputId: "test.advance" },
  outputs: [...click.outputs, { id: "ended", label: "Ended", valueType: "any", role: "branch" }]
});
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

function step(position: number, actionId = "press"): AutomationStudioFlowDraftStep {
  return {
    id: `d${position}`, position, iteration: position, actionId, input: { target: `#control-${position}` },
    effect: actionId === "read" ? "observe" : "mutate", effectApplied: true, proposes: true, disposition: "kept"
  };
}

function write(entry: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep {
  if (entry.actionId === "read") return {
    description: "read the rows", node: "web.dom.extract_list",
    entries: [{ key: "extractList", value: JSON.stringify({ item: ".row", fields: { name: ".name" } }) }]
  };
  return { description: "press the control", node: entry.actionId === "next" ? "test.advance" : "web.dom.click", entries: [{ key: "selector", value: String(entry.input.target) }] };
}

function assembles(steps: AutomationStudioFlowDraftStep[]): void {
  const result = assembleAutomationStudioFlowDraftPlan({ steps: steps.filter(automationStudioFlowDraftStepIsProposed), write, registry, resolution, summary: "Run the authored steps" });
  expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  expect(result.plan).toBeDefined();
}

function rowLoop(): AutomationStudioFlowDraftStep[] {
  const steps = [step(1), step(2, "read"), step(3), step(4)];
  steps[2]!.routing = { kind: "repeat", over: "d2", through: "d4" };
  return steps;
}

describe("withdrawals that would orphan a repeat", () => {
  it("refuses the campaign's exploratory listing and restores its settings (mwp1jqze, decision 0113)", () => {
    const steps = rowLoop();
    steps[1]!.settings = { attempts: 2 };
    const original = structuredClone(steps[1]);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "exploratory", settings: { attempts: 4 } }])).toEqual({
      applied: 0, refused: [{ step: 2, reason: "holds_a_repeat", repeat: 3, holds: "over" }]
    });
    expect(steps[1]).toEqual(original);
    assembles(steps);
  });

  it("refuses both the campaign's source drop and endpoint drop (mwovqznu, decisions 0320/0326)", () => {
    const steps = rowLoop();
    for (const [position, holds] of [[2, "over"], [4, "through"]] as const) {
      expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: position, change: "drop" }])).toEqual({
        applied: 0, refused: [{ step: position, reason: "holds_a_repeat", repeat: 3, holds }]
      });
      assembles(steps);
    }
  });

  it("protects both references to a while-loop's last step", () => {
    const steps = [step(1), step(2, "read"), step(3, "next")];
    steps[1]!.routing = { kind: "repeat", through: "d3", while: "d3" };
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "drop" }])).toEqual({
      applied: 0, refused: [{ step: 3, reason: "holds_a_repeat", repeat: 2, holds: "through", whileLoop: true }]
    });
    assembles(steps);
  });

  it.each([false, true])("allows withdrawing the source when the repeat is removed in the same decision (unrepeat first: %s)", (first) => {
    const steps = rowLoop();
    const amendments: AutomationStudioFlowDraftAmendment[] = [{ step: 2, change: "drop" }, { step: 3, change: "unrepeat" }];
    if (first) amendments.reverse();
    expect(applyAutomationStudioFlowDraftAmendments(steps, amendments)).toEqual({ applied: 2, refused: [] });
    expect(steps[1]!.disposition).toBe("dropped");
    assembles(steps);
  });

  it("allows withdrawing the source and its whole repeat together", () => {
    const steps = rowLoop();
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }, { step: 3, change: "drop" }])).toEqual({ applied: 2, refused: [] });
    assembles(steps);
  });

  it("uses the shown numbers when this decision also reorders the source", () => {
    const steps = rowLoop();
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "reorder", to: 1 }, { step: 2, change: "drop" }]);
    expect(report).toEqual({ applied: 1, refused: [{ step: 2, reason: "holds_a_repeat", repeat: 3, holds: "over" }] });
    expect(steps[0]!.id).toBe("d2");
    assembles(steps);
  });
});

describe("routing that would leave an illegal repeat body", () => {
  it.each([false, true])("refuses the campaign's outer repeat when both were written (outer first: %s)", (first) => {
    const steps = [step(1), step(2, "read"), step(3, "next")];
    const amendments: AutomationStudioFlowDraftAmendment[] = [{ step: 3, change: "repeat", while: 3 }, { step: 2, change: "repeat", while: 3 }];
    if (first) amendments.reverse();
    expect(applyAutomationStudioFlowDraftAmendments(steps, amendments)).toEqual({
      applied: 1, refused: [{ step: 2, reason: "span_holds_routing", repeat: 2, through: 3, routed: 3 }]
    });
    expect(steps[1]!.routing).toBeUndefined();
    expect(steps[2]!.routing).toEqual({ kind: "repeat", through: "d3", while: "d3" });
    assembles(steps);
  });

  it("refuses the campaign's inner repeat without changing the kept outer loop (mwp0jueg, decision 0041)", () => {
    const steps = [step(1), step(2, "read"), step(3, "next")];
    steps[1]!.routing = { kind: "repeat", through: "d3", while: "d3" };
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "repeat", over: 2 }])).toEqual({
      applied: 0, refused: [{ step: 3, reason: "span_holds_routing", repeat: 2, through: 3, routed: 3 }]
    });
    assembles(steps);
  });

  it.each(["optional", "only_if", "on_failed"] as const)("refuses %s inside a kept repeat and restores settings", (change) => {
    const steps = [...rowLoop(), step(5)];
    const before = structuredClone(steps[3]);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 4, change, to: 5, settings: { attempts: 2 } }])).toEqual({
      applied: 0, refused: [{ step: 4, reason: "span_holds_routing", repeat: 3, through: 4, routed: 4 }]
    });
    expect(steps[3]).toEqual(before);
    assembles(steps);
  });

  it("refuses moving a newly routed member inside a span while keeping its routing outside", () => {
    const steps = [...rowLoop(), step(5)];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 5, change: "optional" }, { step: 5, change: "reorder", to: 4 }])).toEqual({
      applied: 1, refused: [{ step: 5, reason: "span_holds_routing", repeat: 3, through: 4, routed: 5 }]
    });
    expect(steps.map((entry) => entry.id)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(steps[4]!.routing).toEqual({ kind: "optional" });
    assembles(steps);
  });

  it("refuses moving a previously routed member into a kept span without changing order, settings or test marks", () => {
    const steps = [...rowLoop(), step(5)];
    steps[4]!.routing = { kind: "optional" };
    for (const entry of steps) entry.replayed = { step: entry.position, actionId: entry.actionId, status: "replayed" };
    const before = structuredClone(steps);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 5, change: "reorder", to: 4, settings: { attempts: 3 } }])).toEqual({
      applied: 0, refused: [{ step: 5, reason: "span_holds_routing", repeat: 3, through: 4, routed: 5 }]
    });
    expect(steps).toEqual(before);
    assembles(steps);
  });

  it("refuses moving a span endpoint past an already routed step", () => {
    const steps = [...rowLoop(), step(5)];
    steps[4]!.routing = { kind: "optional" };
    const before = structuredClone(steps);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 4, change: "reorder", to: 5 }])).toEqual({
      applied: 0, refused: [{ step: 4, reason: "span_holds_routing", repeat: 3, through: 4, routed: 5 }]
    });
    expect(steps).toEqual(before);
    assembles(steps);
  });

  it.each(["add", "keep"] as const)("refuses %s of a previously routed member inside a span before recording claims or settings", (change) => {
    const steps = [step(1), step(2, "read"), step(3), step(4), step(5)];
    steps[2]!.routing = { kind: "repeat", over: "d2", through: "d5" };
    steps[3]!.routing = { kind: "repeat", over: "d1", through: "d4" };
    steps[3]!.disposition = "dropped";
    const before = structuredClone(steps);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 4, change, act: "a1", settings: { attempts: 3 } }])).toEqual({
      applied: 0, refused: [{ step: 4, reason: "span_holds_routing", repeat: 3, through: 5, routed: 4 }]
    });
    expect(steps).toEqual(before);
    assembles(steps);
  });

  it("allows an inclusion that clears the member's old condition", () => {
    const steps = [step(1), step(2, "read"), step(3), step(4), step(5)];
    steps[2]!.routing = { kind: "repeat", over: "d2", through: "d5" };
    steps[3]!.routing = { kind: "optional" };
    steps[3]!.disposition = "dropped";
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 4, change: "keep" }])).toEqual({ applied: 1, refused: [] });
    expect(steps[3]!.routing).toBeUndefined();
    assembles(steps);
  });

  it("rolls back successive rewrites of one inner step and counts each refused amendment", () => {
    const steps = rowLoop();
    steps[3]!.settings = { attempts: 2 };
    const before = structuredClone(steps[3]);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [
      { step: 4, change: "optional", settings: { attempts: 3 } },
      { step: 4, change: "only_if", settings: { attempts: 4 } }
    ])).toEqual({ applied: 0, refused: [
      { step: 4, reason: "span_holds_routing", repeat: 3, through: 4, routed: 4 },
      { step: 4, reason: "span_holds_routing", repeat: 3, through: 4, routed: 4 }
    ] });
    expect(steps[3]).toEqual(before);
    assembles(steps);
  });

  it("preserves the earlier valid rewrite when a later shared-source extension is refused", () => {
    const steps = [step(1), step(2, "read"), step(3), step(4), step(5)];
    steps[2]!.routing = { kind: "repeat", over: "d2", through: "d3" };
    steps[4]!.routing = { kind: "optional" };
    expect(applyAutomationStudioFlowDraftAmendments(steps, [
      { step: 4, change: "repeat", over: 2 },
      { step: 4, change: "repeat", over: 2, through: 5 }
    ])).toEqual({ applied: 1, refused: [{ step: 4, reason: "span_holds_routing", repeat: 3, through: 5, routed: 5 }] });
    expect(steps[3]!.routing).toEqual({ kind: "repeat", over: "d2", through: "d4" });
    assembles(steps);
  });

  it.each([false, true])("keeps valid shared-source repeats (overlapping: %s)", (overlap) => {
    const steps = [step(1), step(2, "read"), step(3), step(4), step(5), step(6)];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [
      { step: 3, change: "repeat", over: 2, through: overlap ? 5 : 4 },
      { step: overlap ? 4 : 5, change: "repeat", over: 2, through: 6 }
    ])).toEqual({ applied: 2, refused: [] });
    expect(steps.filter(automationStudioFlowDraftStepIsProposed)).toHaveLength(6);
    assembles(steps);
  });

  it("refuses a shared-source repeat that extends an existing span over routed steps", () => {
    const steps = [step(1), step(2, "read"), step(3), step(4), step(5)];
    steps[2]!.routing = { kind: "repeat", over: "d2", through: "d3" };
    steps[4]!.routing = { kind: "optional" };
    assembles(steps);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 4, change: "repeat", over: 2, through: 5 }])).toEqual({
      applied: 0, refused: [{ step: 4, reason: "span_holds_routing", repeat: 3, through: 5, routed: 5 }]
    });
    assembles(steps);
  });

  it("refuses a span over an interruption whose effective routing is optional", () => {
    const steps = [step(1), step(2, "read"), step(3), step(4)];
    steps[3]!.interruption = true;
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "repeat", over: 2, through: 4 }])).toEqual({
      applied: 0, refused: [{ step: 3, reason: "span_holds_routing", repeat: 3, through: 4, routed: 4 }]
    });
    assembles(steps);
  });
});
