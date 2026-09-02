import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { ProblemsView, automationProblemsForScope, normalizeAutomationProblems } from "./index";

describe("Automation Problems workspace", () => {
  it("deduplicates stable codes and scopes issues to the selected object", () => {
    const normalized = normalizeAutomationProblems([
      { id: "graph:parameter", code: "node.parameter.required", severity: "error", message: "Recipient is required.", flowId: "flow.checkout", nodeId: "node.send", artifactLabel: "Checkout Flow" },
      { id: "duplicate-id", code: "node.parameter.required", severity: "error", message: "Recipient is required.", flowId: "flow.checkout", nodeId: "node.send", artifactLabel: "Checkout Flow" },
      { id: "router:recommendation", severity: "warning", message: "Add a fallback.", flowId: "flow.checkout", routeId: "route.primary", artifactLabel: "Checkout Router" },
      { id: "recording:notice", severity: "info", message: "Evidence is old.", artifactId: "recording.one", artifactLabel: "Recording one" }
    ]);

    expect(normalized).toHaveLength(3);
    expect(normalized[0]).toMatchObject({ code: "node.parameter.required", severity: "error", blocking: true, scopeLabel: "Checkout Flow" });
    expect(automationProblemsForScope(normalized, "node.send").map((problem) => problem.code)).toEqual(["node.parameter.required"]);
    expect(automationProblemsForScope(normalized, "flow.checkout")).toHaveLength(2);
  });

  it("renders grouped severity, scope controls, friendly issue detail, and navigation", () => {
    const html = renderToStaticMarkup(createElement(ProblemsView, {
      currentObjectId: "node.send",
      currentObjectLabel: "Send",
      problems: [
        { id: "graph:parameter", severity: "error", code: "node.parameter.required", label: "Send / Recipient", message: "Recipient is required.", artifactLabel: "Checkout Flow", nodeId: "node.send" },
        { id: "snapshot:warning", severity: "warning", code: "recording.stale", message: "Recording evidence is stale.", artifactLabel: "Checkout Flow", artifactKind: "recording" },
        { id: "snapshot:info", severity: "info", code: "runtime.note", message: "Runtime note.", artifactLabel: "Runtime" }
      ],
      onOpenProblem: () => undefined
    }));

    expect(html).toContain("Problem scope");
    expect(html).toContain("Whole project");
    expect(html).toContain("Current object");
    expect(html).toContain("Problem severity");
    expect(html).toContain("Errors");
    expect(html).toContain("Warnings");
    expect(html).toContain("Info");
    expect(html).toContain("Blocking errors");
    expect(html).toContain("Recommendations");
    expect(html).toContain("Information");
    expect(html).toContain("Send / Recipient");
    expect(html).toContain("node.parameter.required");
    expect(html).toContain("automation-problem-groups");
  });

  it("bounds large problem collections to 100 rows per page", () => {
    const html = renderToStaticMarkup(createElement(ProblemsView, {
      problems: Array.from({ length: 101 }, (_, index) => ({ id: "problem." + index, severity: index % 2 ? "warning" : "error", message: "Issue " + index, artifactLabel: "Flow " + (index % 3) }))
    }));
    expect((html.match(/<li><button/g) ?? []).length).toBe(100);
    expect(html).toContain("1-100 of 101");
    expect(html).toContain("Next");
  });

  it("uses server pages for project Problems instead of slicing the broad snapshot", () => {
    const source = readFileSync(new URL("./ProblemsView.tsx", import.meta.url), "utf8");
    expect(source).toContain("props.onListProblems");
    expect(source).toContain("cursor: string | null");
    expect(source).toContain("props.projectId ? [] : props.problems");
    expect(source).toContain("remotePage.nextCursor");
  });

  it.each([
    ["loading", "Validating project", "Checking for problems"],
    ["error", "Validation failed", "Validation could not be completed."],
    ["permission-denied", "Validation unavailable", "You do not have permission"],
    ["stale", "Results may be stale", "These results may be out of date."]
  ] as const)("renders the %s host state", (status, title, message) => {
    const html = renderToStaticMarkup(createElement(ProblemsView, {
      problems: [],
      validation: { status }
    }));
    expect(html).toContain(title);
    expect(html).toContain(message);
  });

  it("renders an inactive stale state with validation disabled", () => {
    const html = renderToStaticMarkup(createElement(ProblemsView, {
      activity: "inactive",
      problems: [],
      validation: { status: "stale" },
      onRequestValidation: () => undefined
    }));
    expect(html).toContain("Validation is paused while this view is inactive.");
    expect(html).toContain("disabled");
    expect(html).toContain("Validate again");
  });
});
