// The repair brief says up front that the draft is the Flow being repaired and
// how it comes to be tested whole (live run murwcmx2, cause C-F, t194-w70), and
// never orders a rerun of a step the re-author does not change (t274-c4). Live
// run `run-muw60j7c-bb7c9a62`'s brief said every carried step had to be rerun
// live, step 5 said "each is still rerun live", and the domain refused every
// rerun of the carried type step for naming no handle, five rounds running. The
// test runs an unchanged carried step as the Flow saved it.
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
    it(`says up front, for ${kind}, how the Flow is tested whole and that only a step the test names needs a live rerun`, () => {
      const body = brief(code);
      const whatToDo = body.indexOf("What to do:");
      const asSaved = body.indexOf("Your draft is the Flow being repaired, as it was saved");
      expect(asSaved).toBeGreaterThan(-1);
      // Up front: before the findings, so it is read before any of them.
      expect(asSaved).toBeLessThan(body.indexOf("What the last run produced"));
      expect(body).toContain("The Flow is tested -- and this repair finished -- only by a run of the whole Flow from its start: each step you leave unchanged is run as the Flow saved it, and each step you change is run with your change.");
      expect(body).toContain("do not rerun a step you are not changing");
      expect(body).toContain("If the test cannot run a step of the saved Flow as it stands, it names that step by number (not_run_in_this_build): rerun only those");
      expect(body).toContain("a rerun of a carried step is first put back where its node started in the run being repaired");
      expect(body).toContain("Then complete: the whole Flow is tested from its start and judged.");
      // Nothing orders an unchanged step rerun (run-muw60j7c-bb7c9a62, C-4).
      expect(body).not.toMatch(/rerun each step|still rerun live|rerunning a step with the parameters it has|None of your draft's steps has run in this repair: they came/u);
      // Step 5 keeps the unchanged steps as the Flow saved them, and the test runs them so.
      const steps = body.slice(whatToDo);
      expect(steps).toMatch(/5\. Change only what the findings require[^\n]*is left as it is -- the test runs it as the Flow saved it\./u);
    });
  }
});
