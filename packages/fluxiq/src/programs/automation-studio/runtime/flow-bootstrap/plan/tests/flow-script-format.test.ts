import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../action-permissions/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioPlanStepConsequences } from "../../../llm/harness-options/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA, AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT } from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "./index.ts";

// What the model is told about the run its Flow will have. The only Flow the
// first end-to-end panel campaign created kept none of the dismissals its
// exploration needed, because nothing it was shown said the Flow would start
// again from the page as it first was. These rows hold the statement in the
// format, and in the completion schema that carries the format to the model,
// so a later rewrite of either cannot drop it unnoticed.

const REPLAY_PREMISE = "nothing you did while gathering evidence is still in effect then";

describe("the Flow script format's replay premise", () => {
  it("says the Flow runs without the model and without anything exploration changed", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("The Flow runs later on its own, with no model, from the page the run starts on");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain(REPLAY_PREMISE);
  });

  it("names a dismissal as a step the answer depends on, not as looking", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("every change the answer depended on is a step, in the order you made it, including closing a notice, prompt or banner that stood in front of a control");
  });

  it("reaches the model through the completion schema it answers", () => {
    expect(String(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA.description)).toContain(REPLAY_PREMISE);
  });
});

// The consequence declaration, and whether the sentence that asks for it can be
// answered.
//
// Two live builds met the refusal that asks a press step what pressing would
// do, wrote exactly the right line, and were answered
// `bootstrap.unknown_parameter` (`run-mud7fssy-902f877b`,
// `run-mud7p1wg-3049531f`). A sentence in the format and a reader that refuses
// what it asks for is worse than saying nothing, so these rows hold both ends
// at once: the format states the rule and shows it on its own presses, and the
// reader the model's script actually goes through takes the line.
describe("the Flow script format's consequence declaration", () => {
  const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
  const resolution = {
    scope: { kind: "domain" as const, domainId: "web-automation" },
    runtimeCapabilities: ["web.actions"],
    permissions: ["web-automation.action"]
  };

  function press(consequences: string) {
    const flow = [
      "flow: Schedule a post",
      "step: write the post",
      "  node: web.dom.type",
      "  selector: #body",
      "  text: Trail clean-up on Saturday",
      "step: schedule it",
      "  node: web.dom.click",
      "  selector: #schedule",
      `  consequences: ${consequences}`
    ].join("\n");
    return acceptAutomationStudioFlowBootstrapResult({ result: { flow }, registry, resolution });
  }

  it("tells the model to declare what a press would lastingly do, and names every class Core can be asked about", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("A step that presses something says what pressing it would lastingly do");
    // Interpolated rather than spelled here, so a class added to
    // `action-permissions/` is offered without anyone editing the format.
    for (const consequence of AUTOMATION_STUDIO_ACTION_CONSEQUENCES) {
      expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain(consequence);
    }
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("consequences: none");
    // The step that would cause it, not the Flow's purpose. Kept to one
    // sentence with the example that teaches it, because the format is sent on
    // every request and `run-node.ts` says the same thing on the call that
    // actually makes the declaration in a build that explores.
    // One concrete example of each answer, deliberately. Every other sentence
    // the model is shown about this key -- here and in `run-node.ts`'s own
    // description -- illustrates only the empty answer, and four live builds
    // declared every press harmless (`fa-flow-permission-gate-landing.md`).
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("the press that applies a filter is none, the press that publishes is send_or_publish");
  });

  it("carries the line on every press in its own examples, because a model copies the example", () => {
    const lines = AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT.split("\n");
    const presses = lines.flatMap((line, index) => (line.trim() === "node: web.dom.click" ? [index] : []));
    expect(presses.length).toBeGreaterThan(0);
    for (const index of presses) {
      const step: string[] = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        const word = lines[next]?.trim() ?? "";
        if (word === "" || word.startsWith("step") || word.startsWith("subflow") || word === "end" || word.startsWith("flow:") || word.startsWith("Example")) break;
        step.push(word);
      }
      expect(step.some((word) => word.startsWith("consequences:"))).toBe(true);
    }
  });

  it("is read as the step's declaration rather than refused as a parameter no node has", () => {
    const accepted = press("send_or_publish");

    expect(accepted.ok).toBe(true);
    const node = accepted.ok ? accepted.plan.subflows[0]?.nodes[1] : undefined;
    expect(node?.definitionId).toBe("web.output.dom-click");
    expect(node?.consequences).toEqual(["send_or_publish"]);
    // It is a statement about the step, never a parameter the Flow runs with.
    expect(node?.parameters?.consequences).toBeUndefined();
    expect(node?.parameters?.selector).toBe("#schedule");
  });

  it("reads `none` as a declaration that the press causes nothing lasting, and several classes as a list", () => {
    const harmless = press("none");
    expect(harmless.ok && harmless.plan.subflows[0]?.nodes[1]?.consequences).toEqual([]);

    const both = press("create_new, send_or_publish");
    // Kept in the order written. The authoring readers bound the shape and
    // nothing more -- what a class *means*, and the order a person is asked in,
    // belong to `action-permissions/`, and `automationStudioPlanStepConsequences`
    // puts them in that order when it reads the step.
    expect(both.ok && both.plan.subflows[0]?.nodes[1]?.consequences).toEqual(["create_new", "send_or_publish"]);
    expect(automationStudioPlanStepConsequences(both.ok ? both.plan.subflows[0]?.nodes[1] : undefined).declared)
      .toEqual(["send_or_publish", "create_new"]);
  });

  it("takes a line it cannot read as a class without ever calling the key unknown, and refuses it where the classes are known", () => {
    const written = press("publish it");

    // The key exists, so the model is never told it does not. That is the whole
    // difference from `bootstrap.unknown_parameter`, which is what killed the
    // two live builds and taught the model to stop writing the line.
    const codes = written.ok ? [] : written.issues.map((issue) => issue.code);
    expect(codes).not.toContain("bootstrap.unknown_parameter");

    // The authoring readers bound the shape and pass the words on; the reader
    // that owns the vocabulary is the one that refuses them, fail-closed, so a
    // step whose declaration nobody could read never builds.
    const node = written.ok ? written.plan.subflows[0]?.nodes[1] : undefined;
    expect(node?.consequences).toEqual(["publish it"]);
    expect(automationStudioPlanStepConsequences(node).malformed).toBe(true);
    expect(automationStudioPlanStepConsequences(node).declared).toBeUndefined();
  });

  it("leaves a step that declared nothing with no declaration, which is not the same as none", () => {
    const flow = ["flow: Look", "step: read the page", "  node: web.dom.capture_snapshot"].join("\n");
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow }, registry, resolution });

    expect(accepted.ok && accepted.plan.subflows[0]?.nodes[0]?.consequences).toBeUndefined();
  });
});
