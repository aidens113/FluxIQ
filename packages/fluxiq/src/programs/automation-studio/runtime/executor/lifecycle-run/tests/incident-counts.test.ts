// Incident records for every run (state-aware recovery plan, C6, C7; unit
// D2): each incident says how it ended and the retries it spent, in runs
// with no Handlers too, and a run that met no failure keeps the trace it had.

import { describe, expect, it } from "vitest";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { retryPlannedTrue } from "./recovery-paths-fixtures.ts";
import { line, page, pageOptions, press } from "./wiring-fixtures.ts";

describe("incident records for every run", () => {
  it("records a retry, a planned fail and a true failure in a run with no Handlers, without stamping its attempts", async () => {
    const { current, flow, options } = retryPlannedTrue();
    const trace = await runAutomationStudioGraph(flow, options);

    expect(trace.status).toBe("failed");
    expect(current.landed).toEqual(["s1"]);
    expect(trace.incidents?.map((incident) => [incident.origin.nodeId, incident.ending, incident.retries])).toEqual([
      ["s1", "passed", 1],
      ["s2", "planned_fail", 0],
      ["fallback", "true_failure", 0]
    ]);
    expect(trace.incidents?.[2]?.trueFailure).toBe(true);
    // Attempt stamps stay off a Flow without Handlers.
    expect(trace.attempts.some((attempt) => attempt.failureClass)).toBe(false);
  });

  it("keeps the trace of a run that met no failure exactly as it was", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(line("graph.main", [press("s1"), press("s2")]), pageOptions(current));

    expect(trace.status).toBe("succeeded");
    expect("incidents" in trace).toBe(false);
    expect(Object.keys(trace).sort()).toEqual(["attempts", "currentNodeId", "effects", "finishedAt", "regionTransitions", "startedAt", "status", "values"]);
  });
});
