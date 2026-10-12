// A failed build's refused steps paired with the issues its codes carry (t378).
import { describe, expect, it } from "vitest";
import { automationStudioActivityRefusedStepIssues as paired } from "../index.ts";

describe("refused steps paired with their issues", () => {
  it("pairs by line, else by path, else by code, giving an unplaced issue the step's place", () => {
    expect(paired([
      { code: "web.step.consequences_undeclared", line: 32 },
      { code: "web.handle.unknown", path: "plan.subflows.0.nodes.2.parameters" },
      { code: "bootstrap.unknown_parameter" },
      { code: "bootstrap.unknown_parameter" },
      { code: "bootstrap.missing_parameter", line: 99 }
    ], [
      { step: "search for the towels", line: 32 },
      { step: "open the item", path: "plan.subflows.0.nodes.2.parameters" },
      { step: "keep the close ones", path: "plan.subflows.0.nodes.8.parameters.minimum", code: "bootstrap.unknown_parameter" }
    ])).toEqual([
      { code: "web.step.consequences_undeclared", line: 32, step: "search for the towels" },
      { code: "web.handle.unknown", path: "plan.subflows.0.nodes.2.parameters", step: "open the item" },
      { code: "bootstrap.unknown_parameter", path: "plan.subflows.0.nodes.8.parameters.minimum", step: "keep the close ones" },
      { code: "bootstrap.unknown_parameter" },
      { code: "bootstrap.missing_parameter", line: 99 }
    ]);
  });

  it("leaves issues as they came for steps of any other shape, and keeps an issue's own words", () => {
    const issues = [{ code: "bootstrap.unknown_parameter", line: 4, step: "its own words" }, { code: "bootstrap.unknown_parameter", line: 5 }];
    expect(paired(issues, [{ step: "other", line: 4 }, { step: 7, line: 5 }])).toEqual(issues);
    expect(paired(issues, "not a list")).toEqual(issues);
  });
});
