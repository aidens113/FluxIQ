import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import {
  AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES,
  automationStudioResultRepairDirective,
  automationStudioResultRepairFindings
} from "../repair-directive.ts";

// A Flow that reads nothing is not missing a record set.
//
// `run-muqiojz4-04a7a8fc` (bigbox cart): the request was to switch a pickup
// store and add two items to a cart. The Flow navigated, clicked and typed, and
// stored nothing -- which is all it was asked to do. Its refutation carried
// `result.no_record_set` and the fix "Add or fix the step that stores what the
// Flow read", and the re-author spent its build on list reads the request never
// asked for instead of the towel's missing Add to cart.

const codes = AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES;

const doOnly = (fields: Partial<AutomationStudioRunResultSummary> = {}): AutomationStudioRunResultSummary => ({
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 0,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 0,
  recordSets: [],
  flowShape: [
    { nodeId: "start", definitionId: "builtin.control.start" },
    { nodeId: "s1", definitionId: "web.output.navigate", parameters: { url: "https://shop.example/" } },
    // A web step's selectors are withheld from the summary, as in the run (`S/0084`): that does not hide a record output.
    { nodeId: "s2", definitionId: "web.output.dom-type", parameters: { element: { tagName: "input", accessibleName: "Search" }, text: "paper towels" }, parametersWithheld: ["selector", "element.selector"] },
    { nodeId: "s3", definitionId: "web.output.dom-click", parameters: { element: { tagName: "button", accessibleName: "Add to cart" }, timeoutMs: 10000 }, parametersWithheld: ["selector", "element.selector"] },
    { nodeId: "end", definitionId: "builtin.control.end" }
  ],
  withheld: false,
  ...fields
});

const RECORD_WORDS = /record set|stores what the Flow read|stored columns|which rows|list read|rows/i;

describe("a Flow that reads and stores nothing", () => {
  it("gets no no-record-set finding and no record-oriented fix", () => {
    const directive = automationStudioResultRepairDirective({ summary: doOnly() });
    const found = directive.findings.map((finding) => finding.code);
    expect(found).not.toContain(codes.noRecordSet);
    expect(found).not.toContain(codes.countsLookRight);
    expect(found).toEqual([codes.actsJudgedUndone]);
    for (const line of directive.fix) expect(line).not.toMatch(RECORD_WORDS);
    for (const finding of directive.findings) expect(finding.detail).not.toMatch(/record set|which rows/i);
    expect(directive.fix).toHaveLength(1);
    expect(directive.fix[0]).toContain("act");
  });

  it("keeps the no-record-set finding for a Flow whose read ran and stored nothing", () => {
    const reading = doOnly({ reads: [{ nodeId: "s3", definitionId: "web.output.dom-extract_list", pagesRead: 1, truncated: false, kept: 0 }] });
    expect(automationStudioResultRepairFindings(reading).map((finding) => finding.code)).toEqual([codes.noRecordSet]);
  });

  it("keeps it for a Flow with a step authored to store records", () => {
    const flowShape = [...doOnly().flowShape];
    flowShape.splice(3, 0, { nodeId: "s4", definitionId: "web.output.dom-extract_list", parameters: { recordOutput: { datasetId: "items" } } });
    expect(automationStudioResultRepairFindings(doOnly({ flowShape })).map((finding) => finding.code)).toEqual([codes.noRecordSet]);
  });

  it("keeps it for a Flow with Core's node that writes records", () => {
    const flowShape = [...doOnly().flowShape, { nodeId: "s5", definitionId: "builtin.data.write-records", parameters: { recordOutput: null } }];
    expect(automationStudioResultRepairFindings(doOnly({ flowShape })).map((finding) => finding.code)).toEqual([codes.noRecordSet]);
  });

  it("keeps it where a step's parameters cannot be seen, because Core cannot tell then", () => {
    const flowShape = doOnly().flowShape.map((step) => step.nodeId === "s2" ? { nodeId: step.nodeId, definitionId: step.definitionId } : step);
    expect(automationStudioResultRepairFindings(doOnly({ flowShape })).map((finding) => finding.code)).toEqual([codes.noRecordSet]);
    const withheld = doOnly().flowShape.map((step) => step.nodeId === "s3" ? { ...step, parametersWithheld: ["recordOutput.schema"] } : step);
    expect(automationStudioResultRepairFindings(doOnly({ flowShape: withheld })).map((finding) => finding.code)).toEqual([codes.noRecordSet]);
  });

  it("leaves a build test as it was: every test keeps no record set, and its judge drops that finding", () => {
    const test = doOnly({ buildTest: { kind: "build_test", test: "ran", steps: [{ step: 1, action: "click", outcome: "verified" }] } });
    expect(automationStudioResultRepairFindings(test).map((finding) => finding.code)).toEqual([codes.noRecordSet]);
  });
});
