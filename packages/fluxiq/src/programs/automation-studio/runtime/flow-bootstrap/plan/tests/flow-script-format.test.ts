import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../action-permissions/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioPlanStepConsequences } from "../../../llm/harness-options/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA, AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT } from "../index.ts";
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

// The act-on-one-item example (t339). Candidate mode shows it after the format
// on `core.submit_candidate`, and the Flows the creation lanes need choose
// options, set a quantity and press a control that changes something -- a shape
// no example in the format shows. A model copies the example, so it must build
// as written and its lasting press must declare what it changes.
//
// Since t357 the same constant first says how a choice is written -- as the
// state it leaves, with the nodes that set a state -- and how a step only
// sometimes needed is marked, and its example shows both: lane A's scripts
// pressed a swatch the page arrived with already chosen, un-choosing it, and
// had no way to say a banner may not show.
describe("the Flow script act-on-one-item example", () => {
  // The real web library beside Core's built-in nodes: an optional step joins at the built-in Merge.
  const registry = new AutomationStudioNodeRegistry();
  for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);
  const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const lines = AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE.split("\n");
  const heading = lines.indexOf("Example, acting on one item:");
  const example = lines.slice(heading + 1).join("\n");
  const guidance = lines.slice(0, heading).join("\n");

  it("stays out of the format, so the legacy completion schema does not change", () => {
    expect(heading).toBeGreaterThan(0);
    for (const words of ["acting on one item", "optional: yes", "the state it leaves", "web.dom.check"]) {
      expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).not.toContain(words);
      expect(JSON.stringify(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA)).not.toContain(words);
    }
  });

  it("builds as written: a banner closed if it shows, a swatch set, a size chosen, a quantity typed, and last a press that declares modify_existing", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: example }, registry, resolution });
    expect(accepted.ok ? accepted.issues.filter((issue) => issue.severity === "error") : accepted.issues).toEqual([]);
    const nodes = accepted.ok ? accepted.plan.subflows[0]?.nodes ?? [] : [];
    expect(nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "web.output.dom-click", "builtin.control.merge", "web.output.dom-check",
      "web.output.dom-select", "web.output.dom-type", "web.output.dom-click"
    ]);
    const presses = nodes.filter((node) => node.definitionId === "web.output.dom-click");
    expect(presses.map((node) => node.consequences)).toEqual([[], ["modify_existing"]]);
    // The swatch is set, never pressed: a press would toggle a colour the page arrived with.
    expect(nodes[3]?.parameters).toMatchObject({ checked: true });
    // The banner's failed way out joins the path its success takes, which is what the runtime skips past.
    const edges = accepted.ok ? accepted.plan.subflows[0]?.edges ?? [] : [];
    expect(edges.filter((edge) => edge.source.nodeKey === "s2").map((edge) => `${edge.source.portId}->${edge.target.nodeKey}`).sort()).toEqual(["failed->s3", "success->s3"]);
  });

  it("carries the consequence line on every press in the example, because a model copies the example", () => {
    const steps = example.split(/\n(?=step)/u);
    const presses = steps.filter((step) => step.includes("node: web.dom.click"));
    expect(presses.length).toBe(2);
    for (const step of presses) expect(step).toMatch(/consequences: /u);
  });

  it("teaches a choice as the state it leaves, with the nodes that set a state, and says when a press is right instead", () => {
    expect(guidance).toContain("A choice is written as the state it leaves, not as a press. A press toggles: pressing an option the page already shows chosen un-chooses it.");
    expect(guidance).toContain("An option in a dropdown is `node: web.dom.select`");
    // t364: `check` reads the chosen state of an option the page draws itself (lane A round 5's
    // preselected Space Grey `<div>`), so the guidance names it, and no longer sends the model
    // looking for a hidden box behind a swatch.
    expect(guidance).toContain("is `node: web.dom.check` on that control itself, `checked: true` to choose it or `checked: false` to clear it; it presses only when the state differs");
    expect(guidance).toContain("a colour swatch or size chip drawn apart from the others (`marked`)");
    expect(guidance).toContain("Never look for a hidden box behind a swatch or chip: check the swatch or chip itself.");
    expect(guidance).not.toContain("on the box or radio itself");
    // Every instructed choice keeps its own step even when the page arrives with it chosen: the
    // instructed-acts check asks for one, and a later run's page may arrive differently.
    expect(guidance).toContain("Every option the instruction asks for gets its own step, even one the page arrives with already chosen: write it with `web.dom.check` or `web.dom.select`, which change nothing when the state is already right");
    expect(guidance).not.toContain("needs no step");
    expect(guidance).toContain("Press an option with `node: web.dom.click` only when the page shows no chosen state for it at all; `web.dom.check` refuses such a control and says so.");
    expect(guidance).toContain("A press is right for a control that does something each time it is pressed");
    // The example practises what the guidance says: no choice in it is a press.
    const steps = example.split(/\n(?=step)/u);
    expect(steps.filter((step) => /^step: choose/u.test(step)).every((step) => !step.includes("web.dom.click"))).toBe(true);
  });

  // t368, lane A round 7 (`run-muz3jyz8-1d363a69`): every trial did every act right and then failed on the
  // model's own last step, a wait for "Cart (3)" that the page shows only inside a closed mini-cart. The
  // example ended with such a wait, and a model copies the example.
  it("says not to end with an invented confirmation check, because the judge reads the end page, and ends its own example on the act", () => {
    expect(guidance).toContain("Do not end the Flow with a check you invented to confirm it worked: whether the run did what was asked is judged from the page it ends on");
    expect(guidance).toContain("It waits only for something the page visibly showed after that act while you gathered evidence, never for text inside a closed panel or menu, or a notice that has already gone.");
    const steps = example.split(/\n(?=step)/u);
    expect(steps.at(-1)).toContain("node: web.dom.click");
    expect(example).not.toContain("web.dom.wait_for_text");
  });

  it("teaches the optional line for a step only sometimes needed, and where it cannot stand", () => {
    expect(guidance).toContain("`optional: yes` marks a step that is only sometimes needed");
    expect(guidance).toContain("never inside a repeat and never beside an `on <port>:` line");
    expect(example).toContain("  optional: yes");
  });
});

// Legacy is the default and the baseline candidate mode is measured against,
// so what it sends must not move while candidate-only text grows (t357). These
// digests are of the format and the completion schema exactly as the live
// baseline sent them; a deliberate change to legacy updates them in the same
// commit, and nothing else may.
describe("the legacy format and completion schema bytes", () => {
  const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

  it("are unchanged by candidate-only text", () => {
    expect(digest(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT)).toBe("1209b6dd3c48a87d8d5366b38b4c3061114cbdb99a64cbc99697a2de67f480cc");
    expect(digest(JSON.stringify(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA))).toBe("85c8a062a18c40ba32b650a02b8cc3936e3df549565f664113f97efa9187f575");
  });
});
