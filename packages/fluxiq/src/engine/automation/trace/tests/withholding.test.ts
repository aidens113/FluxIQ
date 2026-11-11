// A trace's withholding starts with the run's secret inputs (`runtime/run-secrets/`), so a secret is
// withheld wherever it reaches the trace and every dispatch is told to withhold it.
import { describe, expect, it } from "vitest";
import { runWithAutomationStudioRunSecrets } from "../../../../runtime/run-secrets/index.ts";
import { automationStudioTraceWithholding } from "../withholding.ts";

describe("a trace's withholding in a run with secrets", () => {
  it("withholds the secrets from the start, in prose and data alike", () => {
    runWithAutomationStudioRunSecrets({ password: "hunter2" }, () => {
      const trace = automationStudioTraceWithholding();
      expect(trace.values().texts).toEqual(["hunter2"]);
      expect(trace.apply({ attempts: [{ message: "Could not type hunter2.", outputs: { typed: "hunter2" } }] })).toEqual({ attempts: [{ message: "Could not type [withheld].", outputs: { typed: "[withheld]" } }] });
    });
    expect(automationStudioTraceWithholding().values().texts).toEqual([]);
  });
});
