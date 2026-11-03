// With sample rows, the note beside a list of today's values also names the field that separates the
// rows the values keep from those they leave out, on every sample; without, it is today's note (t800).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { automationStudioFlowPlanListedValuesAdvice } from "../listed-values-advice.ts";

function planWith(where: unknown[]): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "read", definitionId: "web.output.dom-extract_list", definitionVersion: "1.0.0", parameters: { extractList: { handle: "extraction.1", where } } }], edges: [] }]
  } as unknown as AutomationStudioFlowBootstrapPlan;
}

const WHERE = [{ field: "shelf", equals: ["North", "East"] }];
const REQUEST = "books on the shelves I look after";
const SAMPLE = [
  { shelf: "North", ribbon: "yes", title: "A" },
  { shelf: "East", ribbon: "yes", title: "B" },
  { shelf: "West", ribbon: "(no value)", title: "C" },
  { shelf: "South", ribbon: "(no value)", title: "D" }
];

describe("the listed-values note with sample rows", () => {
  const base = automationStudioFlowPlanListedValuesAdvice(planWith(WHERE), REQUEST);

  it("is today's note exactly without samples", () => {
    expect(base).toHaveLength(1);
    expect(automationStudioFlowPlanListedValuesAdvice(planWith(WHERE), REQUEST, [])).toEqual(base);
  });

  it("names the field that separates kept from left-out rows, quoting no row value", () => {
    const [note] = automationStudioFlowPlanListedValuesAdvice(planWith(WHERE), REQUEST, [SAMPLE]);
    expect(note!.startsWith(base[0]!)).toBe(true);
    expect(note).toContain("\"ribbon\"");
    expect(note).toContain("has a value");
    expect(note).not.toContain("yes");
  });

  it("names a field only when it separates on every sample", () => {
    const disagree = [{ shelf: "North", ribbon: "(no value)" }, { shelf: "West", ribbon: "yes" }];
    expect(automationStudioFlowPlanListedValuesAdvice(planWith(WHERE), REQUEST, [SAMPLE, disagree])).toEqual(base);
    const [note] = automationStudioFlowPlanListedValuesAdvice(planWith(WHERE), REQUEST, [SAMPLE, SAMPLE]);
    expect(note).toContain("2 sets of sample rows");
  });

  it("adds nothing where no field separates, or the sample keeps or leaves out every row", () => {
    expect(automationStudioFlowPlanListedValuesAdvice(planWith(WHERE), REQUEST, [[{ shelf: "North", ribbon: "yes" }, { shelf: "West", ribbon: "yes" }]])).toEqual(base);
    expect(automationStudioFlowPlanListedValuesAdvice(planWith(WHERE), REQUEST, [[{ shelf: "North", ribbon: "yes" }]])).toEqual(base);
  });

  it("stays silent where the request says its values", () => {
    expect(automationStudioFlowPlanListedValuesAdvice(planWith(WHERE), "books on the North or East shelf", [SAMPLE])).toEqual([]);
  });
});
