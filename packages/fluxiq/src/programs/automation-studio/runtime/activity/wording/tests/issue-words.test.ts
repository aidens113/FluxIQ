// A refused Flow said by its issues' own codes, counting steps rather than
// issues (t378, lane B): a search step that sent its form without saying what
// sending does read "some steps point at things that weren't seen on the
// page", and "4 things to fix" was two steps.
import { describe, expect, it } from "vitest";
import { automationStudioActivityCompletionRefusal, automationStudioActivityIssueWords } from "../index.ts";

const CODE = /\b[a-z]+_[a-z_]+\b|\b[a-z]+\.[a-z_]+\.[a-z_]+\b|line \d|nodes?\b/iu;

describe("an issue's own words", () => {
  it("says a step that sends without saying what sending does, not a step pointing at what wasn't seen", () => {
    const said = automationStudioActivityIssueWords([
      { code: "web.step.consequences_undeclared", path: "plan.subflows.0.nodes.2.parameters" },
      { code: "web.step.expected.consequences_classes_or_none", path: "plan.subflows.0.nodes.2.parameters" },
      { code: "web.step.consequences_undeclared", path: "plan.subflows.0.nodes.5.parameters" },
      { code: "web.step.expected.consequences_classes_or_none", path: "plan.subflows.0.nodes.5.parameters" }
    ]);
    expect(said).toEqual({ reasons: ["some steps that press or send something didn't say what doing that does"], steps: 2, others: 0 });
    expect(automationStudioActivityIssueWords([{ code: "web.step.consequences_undeclared", line: 12 }], true).reasons).toEqual(["a step that presses or sends something didn't say what doing that does"]);
  });

  it("counts by script line first, then by node, and names how many when asked", () => {
    const repeats = [{ code: "flow_script.repeat_body_is_routed", path: "flow.line.22", line: 23 }, { code: "flow_script.repeat_invalid", path: "flow.line.27", line: 23 }];
    expect(automationStudioActivityIssueWords(repeats)).toEqual({ reasons: ["a repeat was written where the Flow can't run it"], steps: 1, others: 0 });
    // Without a line, each script line the path names is its own place.
    expect(automationStudioActivityIssueWords(repeats.map(({ code, path }) => ({ code, path })), true).reasons).toEqual(["two repeats were written where the Flow can't run them"]);
  });

  it("reads a code without its place suffix, keeps unknown codes out of the words, and counts a pathless issue apart", () => {
    const said = automationStudioActivityIssueWords([
      { code: "web.handle.unknown_field:extractList.fields.0", path: "plan.subflows.0.nodes.13.parameters" },
      { code: "bootstrap.required_input_unconnected", path: "plan.subflows.0.nodes.s9.inputs.items" },
      { code: "something.new" },
      { code: "something.new" }
    ]);
    expect(said).toEqual({ reasons: ["a step points at something that wasn't seen on the page", "a step wasn't given what it works on from an earlier step"], steps: 2, others: 2 });
    for (const reason of said.reasons) expect(reason).not.toMatch(CODE);
  });
});

describe("a refused completion, by its issues", () => {
  it("says the issues' own reason over the refusal's family, and counts the steps", () => {
    const said = automationStudioActivityCompletionRefusal({
      issueCodes: ["web.step.consequences_undeclared", "web.step.expected.consequences_classes_or_none"],
      feedback: { refusal: "flow_bootstrap.evidence_completion_parameters_unresolved", issues: [
        { code: "web.step.consequences_undeclared", path: "plan.subflows.0.nodes.2.parameters" },
        { code: "web.step.expected.consequences_classes_or_none", path: "plan.subflows.0.nodes.2.parameters" },
        { code: "web.step.consequences_undeclared", path: "plan.subflows.0.nodes.4.parameters" },
        { code: "web.step.expected.consequences_classes_or_none", path: "plan.subflows.0.nodes.4.parameters" }
      ] }
    });
    expect(said).toBe("Sent back because some steps that press or send something didn't say what doing that does. 2 steps need fixing.");
    expect(said).not.toContain("weren't seen on the page");
  });

  it("falls back to the refusal's family when its issues have no words", () => {
    expect(automationStudioActivityCompletionRefusal({ issueCodes: ["x.y"], feedback: { refusal: "flow_bootstrap.evidence_completion_plan_invalid", issues: [{ code: "x.y", path: "plan.subflows.0.nodes.1" }] } }))
      .toBe("Sent back because some steps weren't written in a way the Flow can run. One step needs fixing.");
  });
});

// Lane D (t378): the ending said "a step was given a setting it doesn't take";
// the refused step is named in the model's own words where the issue carries them.
describe("a refused step named in the model's own words", () => {
  const KEEP = "keep requests with 5 or more mutual friends";

  it("names one step by its words, never its line or code", () => {
    const said = automationStudioActivityIssueWords([
      { code: "bootstrap.unknown_parameter", path: "plan.subflows.0.nodes.8.parameters.items", line: 14, step: KEEP },
      { code: "bootstrap.unknown_parameter", path: "plan.subflows.0.nodes.8.parameters.where", line: 14, step: KEEP }
    ], true, true);
    expect(said.reasons).toEqual([`the step '${KEEP}' was given a setting it doesn't take`]);
    expect(said.steps).toBe(1);
    expect(said.reasons[0]).not.toMatch(/14|bootstrap|nodes/u);
  });

  it("names two steps, and counts three or a step with no words", () => {
    const two = automationStudioActivityIssueWords([
      { code: "web.step.consequences_undeclared", line: 32, step: "search for the product" },
      { code: "web.step.consequences_undeclared", line: 58, step: "search again." }
    ], true, true);
    expect(two.reasons).toEqual(["the steps 'search for the product' and 'search again' press or send something but didn't say what doing that does"]);
    const unnamed = automationStudioActivityIssueWords([
      { code: "web.step.consequences_undeclared", line: 32, step: "search for the product" },
      { code: "web.step.consequences_undeclared", line: 58 }
    ], true, true);
    expect(unnamed.reasons).toEqual(["two steps that press or send something didn't say what doing that does"]);
    const three = automationStudioActivityIssueWords([1, 2, 3].map((line) => ({ code: "bootstrap.missing_parameter", line, step: `step ${line}` })), true, true);
    expect(three.reasons).toEqual(["three steps are missing a setting they need"]);
  });

  it("holds a long step's words to a bound and leaves out a handle, and says nothing of them unless asked", () => {
    const long = `click t857 then ${"read every request on the page ".repeat(6)}`;
    const said = automationStudioActivityIssueWords([{ code: "bootstrap.missing_parameter", line: 3, step: long }], false, true).reasons[0]!;
    expect(said).toMatch(/^the step '.+…' is missing a setting it needs$/u);
    expect(said).not.toContain("t857");
    expect(said.length).toBeLessThan(140);
    expect(automationStudioActivityIssueWords([{ code: "bootstrap.missing_parameter", line: 3, step: KEEP }]).reasons).toEqual(["a step is missing a setting it needs"]);
  });

  it("names the step on a refused completion's card", () => {
    expect(automationStudioActivityCompletionRefusal({
      issueCodes: ["bootstrap.unknown_parameter"],
      feedback: { refusal: "flow_bootstrap.evidence_completion_plan_invalid", issues: [{ code: "bootstrap.unknown_parameter", path: "plan.subflows.0.nodes.8.parameters.items", line: 14, step: KEEP }] }
    })).toBe(`Sent back because the step '${KEEP}' was given a setting it doesn't take. One step needs fixing.`);
  });
});
