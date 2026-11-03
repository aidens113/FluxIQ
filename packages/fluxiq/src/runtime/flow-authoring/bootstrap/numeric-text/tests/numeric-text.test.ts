// A `where` text test of numbers or dates by characters is found, and refused once; a test of words
// never is (t800, P7). Generic columns of a library catalogue and a repair shop's log, no scenario's.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { AutomationStudioCandidateNumericTextHint } from "../hint.ts";
import { automationStudioFlowPlanNumericTextTests } from "../found.ts";

function planWith(where: unknown[]): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "read", definitionId: "web.output.dom-extract_list", definitionVersion: "1.0.0", parameters: { extractList: { handle: "extraction.1", where } } }], edges: [] }]
  } as unknown as AutomationStudioFlowBootstrapPlan;
}

const kinds = (where: unknown[]) => automationStudioFlowPlanNumericTextTests(planWith(where)).map((found) => found.kind);

describe("a text test of numbers or dates by characters", () => {
  it("is found for digit alternatives and digit classes", () => {
    expect(kinds([{ field: "copies", matches: "^(4|5|6|7)$" }])).toEqual(["number"]);
    expect(kinds([{ field: "copies", matches: "^[4-9]\\d*$" }])).toEqual(["number"]);
    expect(kinds([{ field: "copies", contains: ["4", "5", "6"] }])).toEqual(["number"]);
    expect(kinds([{ field: "copies", startsWith: "12" }])).toEqual(["number"]);
  });

  it("is found for a year, month names and day/month fragments", () => {
    expect(kinds([{ field: "repaired", contains: "2024" }])).toEqual(["date"]);
    expect(kinds([{ field: "repaired", matches: "(19|20)\\d\\d" }])).toEqual(["date"]);
    expect(kinds([{ field: "repaired", matches: "(Jan|Feb|Mar)" }])).toEqual(["date"]);
    expect(kinds([{ field: "repaired", matches: "^\\d{1,2}/\\d{1,2}/" }])).toEqual(["date"]);
    expect(kinds([{ field: "repaired", startsWith: "2024-05" }])).toEqual(["date"]);
  });

  it("is never found for a test of words", () => {
    expect(kinds([{ field: "title", contains: "Gardening" }, { field: "title", matches: "^(Road|Garden)" }, { field: "title", contains: ["may", "spring"] }])).toEqual([]);
    expect(kinds([{ field: "title", contains: "Room 5 guide" }, { field: "model", startsWith: "Drill 3" }, { field: "title", equals: "2024" }])).toEqual([]);
    expect(kinds([{ field: "price", atLeast: 4 }, { field: "added", atLeast: "2024-05-01" }])).toEqual([]);
  });
});

describe("the one-time refusal", () => {
  const where = [{ field: "copies", matches: "^(4|5|6|7)$" }];

  it("refuses the first submission naming the bound, and accepts the same test sent again", () => {
    const hint = new AutomationStudioCandidateNumericTextHint();
    const refused = hint.hint({ plan: planWith(where), standing: undefined });
    expect(refused?.ok).toBe(false);
    expect(refused?.issueCodes).toEqual(["candidate.numeric_text_test"]);
    expect(refused?.feedback?.resend).toBe("accepted_once");
    expect(String(refused?.feedback?.instruction)).toContain("number bound");
    expect(hint.hint({ plan: planWith(where), standing: undefined })).toBeUndefined();
  });

  it("names a date bound, with atLeast and within, for a date", () => {
    const refused = new AutomationStudioCandidateNumericTextHint().hint({ plan: planWith([{ field: "repaired", contains: "2024" }]), standing: undefined });
    const said = String(refused?.feedback?.instruction);
    expect(said).toContain("atLeast");
    expect(said).toContain("within");
  });

  it("refuses a different test later, once each, and never a test of words", () => {
    const hint = new AutomationStudioCandidateNumericTextHint();
    expect(hint.hint({ plan: planWith([{ field: "title", contains: "Gardening" }]), standing: undefined })).toBeUndefined();
    expect(hint.hint({ plan: planWith(where), standing: undefined })).toBeDefined();
    expect(hint.hint({ plan: planWith([...where, { field: "repaired", contains: "2024" }]), standing: undefined })).toBeDefined();
    expect(hint.hint({ plan: planWith([...where, { field: "repaired", contains: "2024" }]), standing: undefined })).toBeUndefined();
  });
});
