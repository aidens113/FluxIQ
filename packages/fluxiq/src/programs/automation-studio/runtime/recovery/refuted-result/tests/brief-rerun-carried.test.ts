// The repair brief says up front that the Flow's steps have not run in this
// repair, and that the Flow is tested -- and the repair finished -- only after
// each has been rerun live (live run murwcmx2, cause C-F, t194-w70). Step 5 used
// to say "keep the steps that reach the page as they are", and the re-author
// never reran them, so its fix was never run from the Flow's start.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioReauthorBrief } from "../brief.ts";
import { automationStudioResultRepairHistoryEntry } from "../history.ts";

function summary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 10, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "dataset.1", recordCount: 10, refusedCount: 0, truncated: false, columns: ["name", "price"], columnsWithheld: false, rowsChecked: 10, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ name: "Pods" }] }],
    flowShape: [{ nodeId: "node.s7", definitionId: "domain.read_list", parameters: { where: [] } }],
    withheld: false
  };
}

function outcome(findingCode: string): AutomationStudioResultVerificationOutcome {
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: true, verdict: "does_not_answer", basis: "model", code: "core.result.does_not_answer_request",
    reason: "The result was judged not to answer the request.", observation: "10 records stored.",
    repair: { schemaVersion: "automation-studio.result-repair-directive.v1", findings: [{ code: findingCode, detail: "detail" }], fix: [], judgement: { advice: "Relax the accessory condition." } }
  };
}

const brief = (findingCode: string) => automationStudioReauthorBrief({
  projectId: "p", flowId: "f", current: automationStudioResultRepairHistoryEntry({ attempt: 1, outcome: outcome(findingCode), summary: summary(), nodeId: "node.s7" }), history: [], maxAttempts: 3, now: 5
}).body;

describe("the repair brief, on the steps carried into the draft", () => {
  for (const [kind, code] of [["a read", "result.counts_look_right"], ["acts", "result.acts_judged_undone"]] as const) {
    it(`says up front, for ${kind}, that none of the draft's steps has run in this repair and each must be rerun live before the Flow can be tested`, () => {
      const body = brief(code);
      const whatToDo = body.indexOf("What to do:");
      const notRun = body.indexOf("None of your draft's steps has run in this repair");
      expect(notRun).toBeGreaterThan(-1);
      // Up front: before the findings, so it is read before any of them.
      expect(notRun).toBeLessThan(body.indexOf("What the last run produced"));
      expect(body).toContain("they came from the Flow being repaired (not_run_in_this_build), and the Flow is tested -- and this repair finished -- only by a run of the whole Flow from its start.");
      expect(body).toContain("rerun each step of your draft live, in the Flow's order (amend_draft rerun), adding the consequences it would have to its input ([] when it leaves nothing lasting), so it takes its place as a step that ran");
      expect(body).toContain("a rerun of a carried step is first put back where its node started in the run being repaired");
      expect(body).toContain("Then complete: the whole Flow is tested from its start and judged.");
      // Step 5 no longer says to keep the steps as they are without running them.
      const steps = body.slice(whatToDo);
      expect(steps).not.toMatch(/keep the steps (?:that reach the page|that did their act) as they are(?:\.| unless)/u);
      expect(steps).toMatch(/5\. Change only what the findings require[^\n]*still rerun live \(amend_draft rerun\)/u);
    });
  }
});
