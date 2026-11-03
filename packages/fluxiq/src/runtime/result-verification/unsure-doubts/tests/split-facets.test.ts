// Steps whose options each match one word of the same part of the request, in
// different groups of the site's filters (t686, `../split-facets.ts`): Core
// never says the request names such an option, and a doubt about one is not
// contradicted. A venue listing filtered by "Outdoor" and "Weekend" separately,
// against "outdoor seating this weekend": no task, site, item or answer of any
// realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultNarrowingStep, AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerificationAgreement } from "../../agreement/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultNarrowingDoubtContradicted, automationStudioResultSplitFacets } from "../index.ts";

const OUTDOOR: AutomationStudioResultNarrowingStep = { nodeId: "seating", label: "Choose Outdoor seating", effect: "same_page", group: "Seating", chose: "Outdoor", leftOptions: [{ words: "Indoor", count: 30 }], addedChoice: true, resultCount: { before: 60, after: 24 } };
const WEEKEND: AutomationStudioResultNarrowingStep = { nodeId: "when", label: "Choose Weekend", effect: "same_page", group: "Open", chose: "Weekend", leftOptions: [{ words: "Weekdays", count: 11 }], addedChoice: true, resultCount: { before: 24, after: 15 } };
const CUISINE: AutomationStudioResultNarrowingStep = { nodeId: "cuisine", label: "Choose Thai", effect: "same_page", group: "Cuisine", chose: "Thai", addedChoice: true, resultCount: { before: 15, after: 8 } };

const REQUEST = "List every Thai restaurant in the city guide with outdoor seating this weekend, rated 4 or higher, with name and address.";

const read = (steps: AutomationStudioResultNarrowingStep[]): AutomationStudioResultReadAccount =>
  ({ nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "control_absent", truncated: false, kept: 8, narrowedBefore: steps });

const summary = (steps: AutomationStudioResultNarrowingStep[]): AutomationStudioRunResultSummary => ({
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 8, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [],
  reads: [read(steps)], flowShape: [...steps.map((step) => ({ nodeId: step.nodeId, definitionId: "click" })), { nodeId: "read", definitionId: "extract_list" }], withheld: false
});

const steps = [OUTDOOR, WEEKEND, CUISINE];
const says = automationStudioRequestWording([{ title: "Goal", body: REQUEST }], summary(steps))?.says;
const wordsOf = (step: AutomationStudioResultNarrowingStep) => (step.chose && REQUEST.toLowerCase().includes(step.chose.toLowerCase()) ? [step.chose] : undefined);

describe("split facets (t686)", () => {
  it("are the steps in different groups each choosing one word of the same phrase of the request, never a word further off in its clause", () => {
    const facets = automationStudioResultSplitFacets(steps, REQUEST, wordsOf);
    expect([...facets.keys()].sort()).toEqual(["seating", "when"]);
    expect(facets.get("seating")).toEqual({ clause: "outdoor seating this weekend", others: [WEEKEND] });
  });

  it("are none where the steps share a group, or each matches a word of another clause", () => {
    expect(automationStudioResultSplitFacets([OUTDOOR, { ...WEEKEND, group: "Seating" }], REQUEST, wordsOf).size).toBe(0);
    expect(automationStudioResultSplitFacets([OUTDOOR, WEEKEND], "List every restaurant with outdoor seating. Open at the weekend.", wordsOf).size).toBe(0);
  });

  it("leave a doubt that the request does not name the option standing, where a lone option of the request's words is contradicted", () => {
    const doubt = (step: string) => ({ observed: `The ${step} step chose an option the request does not name.` });
    expect(automationStudioResultNarrowingDoubtContradicted(doubt("Choose Outdoor seating"), [read(steps)], REQUEST, says)).toBeUndefined();
    expect(automationStudioResultNarrowingDoubtContradicted(doubt("Choose Outdoor seating"), [read([OUTDOOR, CUISINE])], REQUEST, says)).toContain("the request itself says \"Outdoor\"");
  });

  it("are never marked as a contradicted doubt through the agreement", () => {
    const judged = (answersRequest: "yes" | "unknown", observed: string) => automationStudioResultVerdict({ summary: summary(steps), diagnosis: { answersRequest, observed }, basis: "model" });
    const wording = automationStudioRequestWording([{ title: "Goal", body: REQUEST }], summary(steps));
    const agreed = automationStudioResultVerificationAgreement({ first: judged("unknown", "The Choose Weekend step chose Weekend, an option the request does not name."), second: judged("yes", "8 rows."), confirmAnswer: true, reads: [read(steps)], requestText: REQUEST, wording });
    expect(agreed).not.toHaveProperty("contradictedUnsure");
  });
});
