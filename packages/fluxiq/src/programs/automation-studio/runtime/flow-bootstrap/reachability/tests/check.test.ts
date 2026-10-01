import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { checkAutomationStudioFlowBootstrapReachesStartLocation } from "../check.ts";

// Whether the Flow a build wrote could reach the place it was told to start.
//
// The run behind this: `run-muht9lpw-a39aa056` built a Flow of one node -- a
// list extraction, with no navigation anywhere in it -- and replay failed
// before its first step, `Cannot access contents of url "about:blank"`. Its
// exploration had navigated, dismissed the page's interruptions and read the
// list; the amendments that followed reduced the draft to the reading alone,
// and every completion check passed it, because every one of them asks whether
// the Flow could answer and none asked whether it could run.

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);

const START = "https://shop.test/collections/audio";
const EXTRACT_LIST: JsonObject = { extractList: { item: "li.product", fields: { name: ".name" } } };

type Step = string | { definitionId: string; parameters: JsonObject };

function planOf(...steps: Step[]): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Primary", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: steps.map((step, index) => ({
        key: `step${index + 1}`,
        definitionId: typeof step === "string" ? step : step.definitionId,
        definitionVersion: "1.0.0",
        ...(typeof step === "string" ? {} : { parameters: step.parameters })
      })),
      edges: []
    }]
  };
}

function goTo(url: string): Step {
  return { definitionId: "web.output.browser-navigate", parameters: { url } };
}

function check(plan: AutomationStudioFlowBootstrapPlan, startLocation?: string) {
  return checkAutomationStudioFlowBootstrapReachesStartLocation({ plan, registry, resolution, ...(startLocation === undefined ? {} : { startLocation }) });
}

const READS = { definitionId: "web.output.dom-extract_list", parameters: EXTRACT_LIST };

describe("a build may not propose a Flow that cannot reach where it starts", () => {
  it("refuses a Flow that acts on the target it was told to start at and never goes there", () => {
    const verdict = check(planOf(READS), START);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.issue).toMatchObject({ severity: "error", code: "bootstrap.cannot_reach_start_location", path: "plan.subflows" });
  });

  it("accepts the same Flow once the step that goes there is in it", () => {
    expect(check(planOf(goTo(START), READS), START)).toEqual({ ok: true });
  });

  it("says where the Flow starts, what steps it has, and the one thing to do", () => {
    const verdict = check(planOf(READS, "web.output.dom-capture_snapshot"), START);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.cannotReach).toEqual({
      starts: START,
      lacks: "no step of this Flow goes to where it starts",
      steps: ["web.output.dom-extract_list", "web.output.dom-capture_snapshot"]
    });
    expect(verdict.instruction).toContain("Run the node from your node library that goes to cannotReach.starts");
  });

  it("lists every step of a long Flow: no count cap (user, 2026-09-30)", () => {
    const verdict = check(planOf(...Array.from({ length: 120 }, () => READS)), START);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.cannotReach.steps).toHaveLength(120);
    expect(verdict.cannotReach).not.toHaveProperty("stepsWithheld");
  });

  // A build handed its target begins already there, which is the right shape
  // when a person is asking about what is in front of them.
  it("leaves a build that was given no start location alone", () => {
    expect(check(planOf(READS))).toEqual({ ok: true });
    expect(check(planOf(READS), "   ")).toEqual({ ok: true });
  });

  it("leaves a Flow that touches no target alone, whatever it was told about a start", () => {
    expect(check(planOf("builtin.data.constant", "builtin.data.write-records"), START)).toEqual({ ok: true });
  });

  it("counts a Core node told to dispatch a domain output as acting on the target", () => {
    const dispatches = { definitionId: "builtin.policy.action", parameters: { outputId: "web.dom.extract_list", parameters: EXTRACT_LIST } };
    // A dispatcher that names no output dispatches nothing, so it is not a step
    // that acts on anything.
    const namesNothing = { definitionId: "builtin.policy.action", parameters: { outputId: "" } };

    expect(check(planOf(dispatches), START).ok).toBe(false);
    expect(check(planOf(namesNothing), START)).toEqual({ ok: true });
  });
});

// How a Flow gets to where it starts belongs to the domain and to the model.
// The check reads the value a step was written with and nothing else, loosely,
// because a build told to start at a page may legitimately write the step that
// goes there with the site's front page or a neighbouring one.
describe("what counts as going to where the Flow starts", () => {
  it("counts the front page, a deeper page and a neighbouring one", () => {
    for (const url of ["https://shop.test/", "https://shop.test/collections/audio?page=2", "https://shop.test/collections/lighting"]) {
      expect(check(planOf(goTo(url), READS), START)).toEqual({ ok: true });
    }
  });

  it("counts a location written inside a structured parameter, and one written in another case", () => {
    const clicks = { definitionId: "web.output.dom-click", parameters: { target: { location: START, handle: "target.7" } } };

    expect(check(planOf(clicks, READS), START)).toEqual({ ok: true });
    expect(check(planOf(goTo("HTTPS://Shop.Test/Collections/Audio"), READS), START)).toEqual({ ok: true });
  });

  it("does not count a step that goes somewhere else, or one that carries only the scheme", () => {
    expect(check(planOf(goTo("https://other.test/collections/audio"), READS), START).ok).toBe(false);
    expect(check(planOf(goTo("https://"), READS), START).ok).toBe(false);
  });

  // Twelve characters is longer than any scheme and separator a location begins
  // with, and a start location shorter than that has to be agreed with whole.
  it("holds a short start location to the whole of itself", () => {
    expect(check(planOf(goTo("https://x.io/audio"), READS), "https://x.io")).toEqual({ ok: true });
    expect(check(planOf(goTo("https://y.io/audio"), READS), "https://x.io").ok).toBe(false);
  });
});

// A refusal the build cannot act on is a rewrite loop, not a correction. A
// domain that registers no node which can be told a destination cannot reach a
// start location however the Flow is written, so nothing is refused.
describe("a build whose node library cannot be told where to go", () => {
  const readCell: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: "doc.output.read-cell",
    version: "1.0.0",
    label: "Read Cell",
    description: "Read one cell of the open document.",
    category: "doc",
    source: { kind: "importer", domainId: "documents", packageId: "@example/documents", implementationKey: "doc.read_cell" },
    availability: { kind: "domain", domainId: "documents" },
    capabilities: { executable: true },
    requiredRuntimeCapabilities: ["doc.actions"],
    outputAction: { fixedOutputId: "doc.read_cell" },
    inputs: [{ id: "in", label: "In", valueType: "signal", role: "control" }],
    outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }],
    parameters: [{ id: "cell", label: "Cell", valueType: "object", ui: { control: "value" } }]
  };
  const openDocument: AutomationStudioNodeDefinition = {
    ...readCell,
    id: "doc.output.open",
    label: "Open Document",
    description: "Open a document by its address.",
    source: { kind: "importer", domainId: "documents", packageId: "@example/documents", implementationKey: "doc.open" },
    outputAction: { fixedOutputId: "doc.open" },
    parameters: [{ id: "location", label: "Location", valueType: "string", required: true, ui: { control: "text" } }]
  };
  const documents = { scope: { kind: "domain" as const, domainId: "documents" }, runtimeCapabilities: ["doc.actions"] };
  const startLocation = "doc://budget/Q3";
  const plan = planOf("doc.output.read-cell");

  it("is left exactly where it stood", () => {
    const readingOnly = new AutomationStudioNodeRegistry([readCell]);

    expect(checkAutomationStudioFlowBootstrapReachesStartLocation({ plan, registry: readingOnly, resolution: documents, startLocation })).toEqual({ ok: true });
  });

  it("is refused once its library holds a node that takes a destination", () => {
    const withOpen = new AutomationStudioNodeRegistry([readCell, openDocument]);
    const verdict = checkAutomationStudioFlowBootstrapReachesStartLocation({ plan, registry: withOpen, resolution: documents, startLocation });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.cannotReach).toMatchObject({ starts: startLocation, steps: ["doc.output.read-cell"] });
  });

  it("accepts the Flow that opens the document first, in the domain's own spelling", () => {
    const withOpen = new AutomationStudioNodeRegistry([readCell, openDocument]);
    const opens = planOf({ definitionId: "doc.output.open", parameters: { location: startLocation } }, "doc.output.read-cell");

    expect(checkAutomationStudioFlowBootstrapReachesStartLocation({ plan: opens, registry: withOpen, resolution: documents, startLocation })).toEqual({ ok: true });
  });
});
