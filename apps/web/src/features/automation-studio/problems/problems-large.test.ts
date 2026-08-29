import { describe, expect, it } from "vitest";
import {
  collectAutomationProblems,
  MAX_NORMALIZED_PROBLEMS,
  MAX_PROBLEM_INPUTS_SCANNED,
  pageAutomationProblems
} from "./problem-model";

describe("Problems large diagnostics behavior", () => {
  it("bounds input scanning and retained diagnostics", () => {
    const input = Array.from({ length: MAX_PROBLEM_INPUTS_SCANNED + 5_000 }, (_, index) => ({
      code: "diagnostic." + index,
      severity: index % 10 === 0 ? "error" : "warning",
      message: "Issue " + index,
      nodeId: "node." + index
    }));
    const collection = collectAutomationProblems(input);

    expect(collection.scannedCount).toBe(MAX_PROBLEM_INPUTS_SCANNED);
    expect(collection.items).toHaveLength(MAX_NORMALIZED_PROBLEMS);
    expect(collection.truncated).toBe(true);
    expect(collection.items[0]?.severity).toBe("error");
  });

  it("materializes only one bounded page after filtering thousands of diagnostics", () => {
    const collection = collectAutomationProblems(
      Array.from({ length: 4_000 }, (_, index) => ({
        code: "node.issue." + index,
        severity: "warning",
        message: index % 2 ? "Missing target" : "Unreachable branch",
        nodeId: "node." + index
      }))
    );
    const page = pageAutomationProblems(collection.items, {
      filter: "warning",
      query: "missing target",
      scope: "project",
      offset: 1_900
    });

    expect(page.items).toHaveLength(100);
    expect(page.filteredCount).toBe(2_000);
    expect(page.offset).toBe(1_900);
  });
});
