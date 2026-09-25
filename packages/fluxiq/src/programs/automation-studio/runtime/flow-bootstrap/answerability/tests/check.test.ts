import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { checkAutomationStudioFlowBootstrapAnswersInstruction } from "../check.ts";

// Whether the Flow a build wrote could answer the instruction at all.
//
// The four runs behind this: one instruction -- every pair of wireless earbuds
// matching three conditions across every page of results, as a table with four
// named columns -- produced four different Flows, all four proposed as finished,
// one of which navigated twice, typed three times and read nothing. And two runs
// against "search the catalog for 'lamp' and scrape every product the search
// returns" answered in four steps while two others answered in two; both routes
// are legitimate and neither may be refused.

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);

const EARBUDS = "Find every pair of wireless earbuds under $50 with noise cancelling and a rating of at least four stars, across every page of results. "
  + "Give me the answer as a table with columns name, price, rating and link.";
const LAMP = "Search the catalog for 'lamp' and scrape every product the search returns.";

function planOf(...steps: Array<string | { definitionId: string; parameters: JsonObject }>): AutomationStudioFlowBootstrapPlan {
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

function check(plan: AutomationStudioFlowBootstrapPlan, instructionText: string) {
  return checkAutomationStudioFlowBootstrapAnswersInstruction({ plan, registry, resolution, instructionText });
}

describe("a build may not propose a Flow that cannot answer the instruction", () => {
  it("refuses a Flow with no record set in it against an instruction that asks for a table", () => {
    const verdict = check(planOf(
      "web.output.browser-navigate",
      "web.output.browser-navigate",
      "web.output.dom-type",
      "web.output.dom-type",
      "web.output.dom-type"
    ), EARBUDS);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.issue).toMatchObject({ severity: "error", code: "bootstrap.cannot_answer_instruction", path: "plan.subflows" });
  });

  it("says what the instruction asks for, in the person's own words, and what the draft has", () => {
    const verdict = check(planOf("web.output.browser-navigate", "web.output.dom-type"), EARBUDS);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.cannotAnswer).toEqual({
      asks: "a set of records: rows with named fields",
      quote: "Give me the answer as a table with columns name, price, rating and link",
      columns: ["name", "price", "rating", "link"],
      lacks: "no step of this Flow produces or saves a set of records",
      steps: ["web.output.browser-navigate", "web.output.dom-type"]
    });
    expect(verdict.instruction).toContain("Run the step from your node library that returns rows");
  });

  it("accepts a legitimate alternative route: a search reached by URL rather than typed", () => {
    const typed = check(planOf(
      "web.output.browser-navigate",
      "web.output.dom-type",
      "web.output.dom-click",
      "web.output.dom-extract_list"
    ), LAMP);
    const byUrl = check(planOf("web.output.browser-navigate", "web.output.dom-extract_list"), LAMP);

    expect(typed).toEqual({ ok: true });
    expect(byUrl).toEqual({ ok: true });
  });

  it("leaves an instruction that asks for no records alone, whatever the Flow does", () => {
    const form = planOf("web.output.browser-navigate", "web.output.dom-type", "web.output.dom-click");

    expect(check(form, "Apply for the Senior Platform Engineer role: fill in the application form with my details and submit it.")).toEqual({ ok: true });
    // `table`, `list` and `record` on their own are not a request for rows, and
    // each of these is one of the sites under test.
    expect(check(form, "Book a table for two at the Harbour Room on Friday evening.")).toEqual({ ok: true });
    expect(check(form, "List the mountain bike for sale at $240 in the local classifieds.")).toEqual({ ok: true });
    expect(check(form, "Delete the record for order 1042.")).toEqual({ ok: true });
    expect(check(form, "")).toEqual({ ok: true });
  });

  it("counts a step told where to save its rows, and not one told to save none", () => {
    const saving = { definitionId: "builtin.policy.action", parameters: { outputId: "web.dom.extract_list", recordOutput: { datasetId: "earbuds", schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }] }, writeMode: "append", recordsPath: "result.extracted" } } };
    const savingNone = { definitionId: "builtin.policy.action", parameters: { outputId: "web.dom.click", recordOutput: null } };

    expect(check(planOf("web.output.browser-navigate", saving), EARBUDS)).toEqual({ ok: true });
    expect(check(planOf("web.output.browser-navigate", savingNone), EARBUDS).ok).toBe(false);
  });

  it("holds a Flow to capability and never to an outcome: an extraction that may find nothing is still proposed", () => {
    expect(check(planOf("web.output.browser-navigate", "web.output.dom-extract_list"), EARBUDS)).toEqual({ ok: true });
  });

  // A refusal the build cannot act on is a rewrite loop, not a correction. A
  // library whose nodes never return rows of their own -- Core's builtins alone,
  // whose record writer saves the rows another step hands it -- cannot answer a
  // request for rows however the Flow is written, so nothing is refused.
  it("asks nothing of a build whose node library cannot produce a record set at all", () => {
    const builtinsOnly = new AutomationStudioNodeRegistry();
    const verdict = checkAutomationStudioFlowBootstrapAnswersInstruction({
      plan: planOf("builtin.control.start", "builtin.data.write-records", "builtin.control.end"),
      registry: builtinsOnly,
      resolution: { scope: { kind: "global" as const } },
      instructionText: EARBUDS
    });

    expect(verdict).toEqual({ ok: true });
  });
});
