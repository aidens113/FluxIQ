import { describe, expect, it } from "vitest";
import { collectAutomationProblems } from "../problem-model";
import { browserIdentity, buildCoreProblemReport, PROBLEM_REPORT_LIMIT } from "../diagnostic-report";

const SECRET = "hunter2-card-4111111111111111";

describe("the Problems view's problem report", () => {
  const collection = collectAutomationProblems([
    { code: "flow.node_invalid", severity: "error", blocking: true, label: `Typed ${SECRET}`, message: `Node types "${SECRET}" into #password`, flowId: "flow-1", nodeId: "node-7", flowLabel: "Pay my bank" },
    { code: "flow.edge_dangling", severity: "warning", message: "Dangling edge", flowId: "flow-1", edgeId: "edge-2" }
  ]);

  const report = buildCoreProblemReport({
    now: Date.UTC(2026, 8, 29),
    fluxiqVersion: "0.4.1",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    projectId: "project-1",
    hostState: { status: "ready", currentObject: { id: "flow-1", label: "Pay my bank" } },
    validatedAt: 5,
    problems: collection.items,
    truncated: false
  });

  it("carries versions, ids, codes, severities and counts", () => {
    expect(report).toMatchObject({
      schema: "fluxiq.core-problem-report/1",
      createdAt: "2026-09-29T00:00:00.000Z",
      fluxiqVersion: "0.4.1",
      browser: { name: "Chrome", version: "129" },
      projectId: "project-1",
      currentObjectId: "flow-1",
      validation: { status: "ready", validatedAt: 5 },
      counts: { error: 1, warning: 1, info: 0 },
      truncated: false
    });
    expect(report.problems).toEqual([
      { code: "flow.node_invalid", severity: "error", blocking: true, scopeIds: ["flow-1", "node-7"] },
      { code: "flow.edge_dangling", severity: "warning", blocking: false, scopeIds: ["flow-1", "edge-2"] }
    ]);
  });

  it("never carries a problem's label, message, or an object's name", () => {
    const text = JSON.stringify(report);
    for (const leak of [SECRET, "#password", "Pay my bank", "Dangling edge"]) expect(text).not.toContain(leak);
    expect(report.withheld.length).toBeGreaterThan(0);
  });

  it("is bounded and says when it was cut", () => {
    const many = collectAutomationProblems(Array.from({ length: PROBLEM_REPORT_LIMIT + 5 }, (_, index) => ({ code: `c.${index}`, severity: "info", nodeId: `n${index}` })));
    const bounded = buildCoreProblemReport({ now: 0, userAgent: "", hostState: { status: "ready", currentObject: null }, problems: many.items, truncated: false });
    expect(bounded.problems).toHaveLength(PROBLEM_REPORT_LIMIT);
    expect(bounded.truncated).toBe(true);
    expect(bounded.counts.info).toBe(PROBLEM_REPORT_LIMIT + 5);
  });

  it("names the browser by name and major version only", () => {
    expect(browserIdentity("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).toEqual({ name: "Firefox", version: "131" });
    expect(browserIdentity("curl/8")).toEqual({ name: "Unknown" });
  });
});
