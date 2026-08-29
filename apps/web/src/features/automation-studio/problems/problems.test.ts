import { describe, expect, it } from "vitest";
import { automationProblemsForScope, normalizeAutomationProblems, pageAutomationProblems } from "./problem-model";
describe("problems domain", () => {
  it("normalizes severity, deduplicates codes, and scopes issues", () => {
    const problems = normalizeAutomationProblems([{ id: "a", code: "same", severity: "error", nodeId: "n", message: "A" }, { id: "b", code: "same", severity: "error", nodeId: "n", message: "A" }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.blocking).toBe(true);
    expect(automationProblemsForScope(problems, "n")).toHaveLength(1);
  });

  it("filters by current object, severity, and user-facing search text", () => {
    const problems = normalizeAutomationProblems([
      { code: "node.required", severity: "error", nodeId: "node.send", label: "Recipient", message: "Recipient is required.", artifactLabel: "Checkout" },
      { code: "route.fallback", severity: "warning", routeId: "route.primary", message: "Add a fallback.", artifactLabel: "Checkout" },
      { code: "runtime.note", severity: "info", nodeId: "node.send", message: "Runtime evidence exists.", artifactLabel: "Runtime" }
    ]);
    const page = pageAutomationProblems(problems, {
      currentObjectId: "node.send",
      filter: "error",
      query: "recipient",
      scope: "current",
      offset: 999
    });

    expect(page.items.map((problem) => problem.code)).toEqual(["node.required"]);
    expect(page.counts).toEqual({ error: 1, warning: 0, info: 0 });
    expect(page.offset).toBe(0);
  });
});
