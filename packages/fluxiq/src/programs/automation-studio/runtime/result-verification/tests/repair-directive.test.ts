import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts.ts";
import {
  AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES,
  automationStudioResultRepairDirective,
  automationStudioResultRepairFindings
} from "../repair-directive.ts";

// What a refutation tells the repair to fix.
//
// Every finding here is arithmetic over a summary Core already holds, so each
// test states a result and asserts the instruction that follows from it. The
// judgement's own words are read forgivingly: nothing about them may refuse a
// verdict, and the screens that apply to them are the two every request passes.

const codes = AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES;

const recordSet = (fields: Partial<AutomationStudioResultRecordSetSummary> = {}): AutomationStudioResultRecordSetSummary => ({
  datasetId: "members",
  recordCount: 4,
  refusedCount: 0,
  truncated: false,
  columns: ["name", "role"],
  columnsWithheld: false,
  rowsChecked: 4,
  rowsMissingRequired: 0,
  missingRequiredColumns: [],
  ...fields
});

const result = (fields: Partial<AutomationStudioRunResultSummary> = {}): AutomationStudioRunResultSummary => ({
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 4,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 1,
  recordSets: [recordSet()],
  flowShape: [{ nodeId: "n1", definitionId: "builtin.navigate" }, { nodeId: "n2", definitionId: "web.extract.list" }],
  withheld: false,
  ...fields
});

const codesOf = (summary: AutomationStudioRunResultSummary): string[] =>
  automationStudioResultRepairFindings(summary).map((finding) => finding.code);

describe("what Core's own arithmetic finds wrong with a result", () => {
  it("names a run that kept no record set at all, and says to add the step that stores", () => {
    const directive = automationStudioResultRepairDirective({ summary: result({ recordSetCount: 0, recordSets: [], totalRecordCount: 0 }) });
    expect(directive.findings.map((finding) => finding.code)).toEqual([codes.noRecordSet]);
    expect(directive.fix[0]).toContain("stores what the Flow read");
  });

  it("tells a run whose every row was refused to make a found row storable", () => {
    const directive = automationStudioResultRepairDirective({
      summary: result({ totalRecordCount: 0, totalRefusedCount: 8, recordSets: [recordSet({ recordCount: 0, refusedCount: 8 })] })
    });
    expect(directive.findings[0]?.code).toBe(codes.everyRowRefused);
    expect(directive.findings[0]?.detail).toContain("8 rows were found");
    expect(directive.fix[0]).toContain("thrown away by validation");
  });

  it("tells an empty result to loosen before narrowing, which is the opposite of the tempting advice", () => {
    // Mutation: advise narrowing. A Flow that found nothing cannot be repaired by
    // filtering harder, and a permissive first pass is the rule the whole loop
    // runs on: too much rather than nothing.
    const directive = automationStudioResultRepairDirective({
      summary: result({ totalRecordCount: 0, recordSets: [recordSet({ recordCount: 0, rowsChecked: 0 })] })
    });
    expect(directive.findings[0]?.code).toBe(codes.noRecordsStored);
    expect(directive.fix[0]).toContain("loosen every condition");
  });

  it("names the required columns that were stored empty, and never a value", () => {
    const directive = automationStudioResultRepairDirective({
      summary: result({
        totalRowsMissingRequired: 3,
        recordSets: [recordSet({ rowsMissingRequired: 3, missingRequiredColumns: ["price", "address"], sampleRows: [{ name: "4 Kelford Row", price: "" }] })]
      })
    });
    const finding = directive.findings.find((item) => item.code === codes.requiredValuesMissing);
    expect(finding?.columns).toEqual(["price", "address"]);
    expect(directive.fix.some((line) => line.includes("price, address"))).toBe(true);
    expect(JSON.stringify(directive)).not.toContain("4 Kelford Row");
  });

  it("names a column the sample shows empty in every row, and leaves the required ones to their own finding", () => {
    const directive = automationStudioResultRepairDirective({
      summary: result({
        totalRowsMissingRequired: 1,
        recordSets: [recordSet({
          columns: ["name", "role", "price"],
          rowsMissingRequired: 1,
          missingRequiredColumns: ["price"],
          sampleRows: [{ name: "Hollis", role: "", price: "" }, { name: "Vane", role: "   ", price: "" }]
        })]
      })
    });
    const finding = directive.findings.find((item) => item.code === codes.columnAlwaysEmpty);
    expect(finding?.columns).toEqual(["role"]);
    expect(finding?.datasetId).toBe("members");
  });

  // `run-muq66ff9-cb3767a1`: the read kept `ad` and filtered on `ad is absent`, and all three re-authors were told to re-point it.
  it("does not call a column empty when a read's own condition keeps it empty, and still names one empty for no stated reason", () => {
    const summary = result({
      recordSets: [recordSet({
        columns: ["name", "role", "ad"],
        sampleRows: [{ name: "Hollis", role: "", ad: "" }, { name: "Vane", role: "", ad: null }]
      })],
      reads: [{ nodeId: "s8", definitionId: "web.output.dom-extract_list", pagesRead: 5, stop: "control_disabled", truncated: false, kept: 2, conditions: [{ condition: "ad is absent", rejected: 20 }] }]
    });
    const directive = automationStudioResultRepairDirective({ summary });
    expect(directive.findings.find((item) => item.code === codes.columnAlwaysEmpty)?.columns).toEqual(["role"]);
    expect(directive.fix.some((line) => line.includes("(role)"))).toBe(true);
    expect(directive.fix.some((line) => line.includes("(role, ad)") || line.includes("(ad)"))).toBe(false);
    // Only that column, and only while a read says so: alone, it leaves no finding at all.
    expect(codesOf(result({ ...summary, recordSets: [recordSet({ columns: ["name", "ad"], sampleRows: [{ name: "Hollis", ad: "" }] })] })))
      .toEqual([codes.countsLookRight]);
    expect(codesOf(result({ recordSets: [recordSet({ columns: ["name", "ad"], sampleRows: [{ name: "Hollis", ad: "" }] })] })))
      .toContain(codes.columnAlwaysEmpty);
  });

  it("says nothing about a set's columns when no row was sampled, because the bound is not a finding", () => {
    expect(codesOf(result({ recordSets: [recordSet()] }))).toEqual([codes.countsLookRight]);
  });

  it("names a sample whose every row is the same row", () => {
    const same: JsonObject = { name: "Hollis", role: "admin" };
    const directive = automationStudioResultRepairDirective({
      summary: result({ recordSets: [recordSet({ sampleRows: [same, { role: "admin", name: "Hollis" }, same] })] })
    });
    const finding = directive.findings.find((item) => item.code === codes.rowsIdentical);
    expect(finding?.detail).toContain("3 rows sampled");
    expect(directive.fix.some((line) => line.includes("row container"))).toBe(true);
  });

  it("does not call one sampled row identical to itself", () => {
    expect(codesOf(result({ recordSets: [recordSet({ sampleRows: [{ name: "Hollis", role: "admin" }] })] })))
      .not.toContain(codes.rowsIdentical);
  });

  it("names a truncated set, so a prefix is not mistaken for the answer", () => {
    const directive = automationStudioResultRepairDirective({ summary: result({ recordSets: [recordSet({ truncated: true })] }) });
    expect(directive.findings.some((finding) => finding.code === codes.recordsTruncated)).toBe(true);
    expect(directive.fix.some((line) => line.includes("Raise what the record output keeps"))).toBe(true);
  });

  it("records that the account was cut without inventing an instruction for it", () => {
    const findings = automationStudioResultRepairFindings(result({ withheld: true }));
    expect(findings.map((finding) => finding.code)).toEqual([codes.countsLookRight, codes.summaryWithheld]);
    const directive = automationStudioResultRepairDirective({ summary: result({ withheld: true }) });
    // Two findings, one instruction: "part of this was cut" is a fact about the
    // account, and a fix line for it would be a change to the Flow that nothing
    // observed.
    expect(directive.fix.length).toBe(1);
  });

  it("says what to compare when no count is wrong, and names the Flow's last step as that", () => {
    const directive = automationStudioResultRepairDirective({ summary: result() });
    expect(directive.findings.map((finding) => finding.code)).toEqual([codes.countsLookRight]);
    expect(directive.fix[0]).toContain("n2 (web.extract.list)");
  });

  // t176, measured provider-free: a Flow as a person or a build saves it ends in
  // its end node, and the fix told the re-author "the Flow's last step is end
  // (builtin.control.end)" -- a node no build authors or edits, named as the
  // place to look. The step named is the last one a build could have written.
  it("never names the Flow's derived start or end node as its last step", () => {
    const directive = automationStudioResultRepairDirective({ summary: result({ flowShape: [
      { nodeId: "start", definitionId: "builtin.control.start" },
      { nodeId: "n2", definitionId: "web.extract.list" },
      { nodeId: "end", definitionId: "builtin.control.end" }
    ] }) });
    expect(directive.fix[0]).toContain("the Flow's last step is n2 (web.extract.list)");
    expect(directive.fix[0]).not.toContain("builtin.control");
    const onlyControl = automationStudioResultRepairDirective({ summary: result({ flowShape: [{ nodeId: "end", definitionId: "builtin.control.end" }] }) });
    expect(onlyControl.fix[0]).not.toContain("last step");
  });

  // Whole since 2026-09-30: it was held to 8 findings, 8 fix lines and 8 columns a finding.
  it("carries every finding, every fix line and every column", () => {
    const directive = automationStudioResultRepairDirective({
      summary: result({
        totalRecordCount: 0,
        totalRefusedCount: 2,
        totalRowsMissingRequired: 2,
        recordSets: Array.from({ length: 4 }, (_set, index) => recordSet({
          datasetId: `set${index}`,
          recordCount: 0,
          refusedCount: 2,
          truncated: true,
          rowsMissingRequired: 2,
          missingRequiredColumns: Array.from({ length: 12 }, (_column, column) => `field${column}`),
          sampleRows: [{ name: "" }, { name: "" }]
        })),
        withheld: true
      })
    });
    // Every-row-refused, required-missing, then per set an empty column and truncation (4 x 2), then withheld.
    expect(directive.findings.length).toBeGreaterThan(8);
    expect(directive.fix.length).toBeGreaterThan(8);
    const required = directive.findings.find((finding) => finding.code === AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.requiredValuesMissing);
    expect(required?.columns).toHaveLength(12);
  });
});

describe("the judgement's own words, read forgivingly", () => {
  it("is absent, not empty, when no model was asked", () => {
    expect(automationStudioResultRepairDirective({ summary: result() }).judgement).toBeUndefined();
  });

  it("carries what the judgement said, whole", () => {
    const directive = automationStudioResultRepairDirective({
      summary: result(),
      judgement: { expected: "  two members  ", observed: "every member", advice: "y".repeat(800) }
    });
    expect(directive.judgement).toEqual({
      expected: "two members",
      observed: "every member",
      advice: "y".repeat(800)
    });
    expect(directive.withheld).toBeUndefined();
  });

  it("ignores anything that is not a usable string without refusing the directive", () => {
    const directive = automationStudioResultRepairDirective({
      summary: result(),
      judgement: { expected: { clause: "two" }, observed: 4, advice: "\n \t " }
    });
    expect(directive.judgement).toBeUndefined();
    expect(directive.withheld).toBeUndefined();
    expect(directive.findings.length).toBeGreaterThan(0);
    expect(directive.fix.length).toBeGreaterThan(0);
  });

  it("drops a credential-shaped sentence whole and says so", () => {
    const directive = automationStudioResultRepairDirective({
      summary: result(),
      judgement: { advice: "use sk-abcd1234efgh5678ijkl9012mnop to sign in", observed: "every member" }
    });
    expect(directive.judgement).toEqual({ observed: "every member" });
    expect(directive.withheld).toBe(true);
    expect(JSON.stringify(directive)).not.toContain("sk-abcd");
  });

  it("redacts a locator inside a sentence and keeps the sentence", () => {
    const directive = automationStudioResultRepairDirective({
      summary: result(),
      judgement: { advice: "filter the rows in .product-card before storing them" }
    });
    expect(directive.judgement?.advice).toBe("filter the rows in [locator withheld] before storing them");
    expect(directive.withheld).toBe(true);
  });
});
