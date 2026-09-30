// An unrecognised throw is recorded by what it was and where Core threw it,
// never by what it said (`../thrown-issue-codes.ts`, `run-muncqlr0-3348202b`).
import { describe, expect, it } from "vitest";
import { flowBootstrapPhaseFailure, flowBootstrapThrownIssueCodes, parseAutomationStudioFlowBootstrapFailureDiagnostic } from "../index.ts";

const PAGE_TEXT = "Millbrook store pickup, towels 2 for 18.99";

function thrownAt(error: Error, frames: string[]): Error {
  error.stack = [`${error.name}: ${error.message}`, ...frames].join("\n");
  return error;
}

describe("a throw the build's catch did not recognise", () => {
  it("is named by its class and the first Automation Studio frame outside the catch", () => {
    const error = thrownAt(new TypeError(PAGE_TEXT), [
      "    at flowBootstrapPhaseFailure (C:\\core\\packages\\fluxiq\\src\\programs\\automation-studio\\runtime\\flow-bootstrap\\generation-failure\\phase-failure.ts:40:9)",
      "    at appendDraftStep (C:\\core\\packages\\fluxiq\\dist\\programs\\automation-studio\\runtime\\flow-draft\\entry.js:212:17)",
      "    at runAutomationStudioLlmEvidenceLoop (C:\\core\\packages\\fluxiq\\dist\\programs\\automation-studio\\runtime\\llm\\evidence-loop.js:590:21)"
    ]);
    expect(flowBootstrapThrownIssueCodes(error)).toEqual(["thrown.TypeError", "thrown.at:runtime.flow-draft.entry.js:212"]);
  });

  it("travels on the phase failure, parses back, and carries no message", () => {
    const error = thrownAt(new Error(PAGE_TEXT), ["    at x (/srv/fluxiq/dist/programs/automation-studio/runtime/flow-draft/amendment.js:88:3)"]);
    const diagnostic = flowBootstrapPhaseFailure("provider_output_validation", undefined, "flow_bootstrap.provider_output_validation_failed", error).diagnostic;
    expect(diagnostic.issueCodes).toEqual(["thrown.Error", "thrown.at:runtime.flow-draft.amendment.js:88"]);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
    expect(JSON.stringify(diagnostic)).not.toContain("Millbrook");
  });

  it("names nothing for a value that is not an error, and no frame outside Automation Studio", () => {
    expect(flowBootstrapThrownIssueCodes("a string")).toEqual([]);
    expect(flowBootstrapThrownIssueCodes(thrownAt(new RangeError("x"), ["    at node:internal/process/task_queues:95:5"]))).toEqual(["thrown.RangeError"]);
    expect(flowBootstrapPhaseFailure("persistence").diagnostic.issueCodes).toBeUndefined();
  });
});
