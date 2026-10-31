import type { JsonObject } from "../../../../../../core/index.ts";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../action-permissions/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { automationStudioPlanStepConsequences } from "../../../llm/harness-options/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";
import {
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA,
  AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE,
  AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT,
  automationStudioEvidenceFlowBootstrapCompletionSchema,
  automationStudioFlowBootstrapSizeLimits
} from "../index.ts";

const REPLAY_PREMISE = "nothing you did while gathering evidence is still in effect then";
function action(id: string): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: `sample.${id}`, version: "1.0.0", label: id, description: id, category: "action",
    source: { kind: "importer", domainId: "sample", implementationKey: id },
    availability: { kind: "domain", domainId: "sample" }, capabilities: { executable: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "selector", label: "Selector", valueType: "string" }, { id: "text", label: "Text", valueType: "string" }]
  };
}

describe("the Flow script format's replay premise", () => {
  it("asks for an explicit observed toggle end-state without inferring intent from a press", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE).toContain("write ensureState as an exact copy of an observed signature tied to this step");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE).toContain("a shown state and the state a press would leave may differ");
  });

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

describe("the Flow script format's consequence declaration", () => {
  const registry = new AutomationStudioNodeRegistry([action("type"), action("press"), action("inspect")]);
  const resolution = {
    scope: { kind: "domain" as const, domainId: "sample" },
    runtimeCapabilities: [],
    permissions: []
  };

  function press(consequences: string) {
    const flow = [
      "flow: Schedule an archive export",
      "step: name the export",
      "  node: sample.type",
      "  selector: #body",
      "  text: Nightly archive",
      "step: schedule it",
      "  node: sample.press",
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

  it("is read as the step's declaration rather than refused as a parameter no node has", () => {
    const accepted = press("send_or_publish");

    expect(accepted.ok).toBe(true);
    const node = accepted.ok ? accepted.plan.subflows[0]?.nodes[1] : undefined;
    expect(node?.definitionId).toBe("sample.press");
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
    const flow = ["flow: Look", "step: read the page", "  node: sample.inspect"].join("\n");
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow }, registry, resolution });

    expect(accepted.ok && accepted.plan.subflows[0]?.nodes[0]?.consequences).toBeUndefined();
  });
});

describe("the state-aware Flow script format", () => {
  it("stays out of the format and the legacy completion schema", () => {
    for (const words of ["start at:", "call:", "checkpoint: yes", "on retry for", "done when:", "then: carry on"]) {
      expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).not.toContain(words);
      expect(JSON.stringify(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA)).not.toContain(words);
    }
  });

  it("gives every new statement a one-line example", () => {
    for (const example of ["`call: payment`", "`card: $input.card = 4111`", "`start at: search` then `when: exists t4`", "`checkpoint: yes`", "`done when: text t11 contains \"Booked\"`", "`on retry for open: a notice covers the list`", "`then: carry on`", "`then: give up`", "`dialog <kind> \"<name>\"`"]) {
      expect(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT).toContain(example);
    }
  });

  it("keeps t378's rule for an interruption at one place, and sends one that can come anywhere to a handler", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT).toContain("An interruption that can only come at one place is an `optional: yes` step there, with its `only after:` steps.");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT).toContain("One that can come at several places, or at any pass of a loop, is one handler instead");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT).toContain("A loop the site asked to slow down still takes `repeat pace:` as well.");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT).toContain("never one you imagine");
    // The loop text t378 wrote is unchanged.
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT).toContain("`repeat pace: <time>` goes beside `repeat over:` or `repeat while:`");
  });
});


describe("the format's guidance on saving values read one by one as one row", () => {
  it("names the node, the records line and a bound value, and stays out of the legacy format", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT).toContain("are saved as one row by a last step `node: builtin.data.write-records` whose `records:` is a list holding one object");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT).toContain("`records: [{\"plan\": \"$step.plan.value\"}]`");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).not.toContain("write-records");
    expect(JSON.stringify(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA)).not.toContain("write-records");
  });

});

describe("the format's guidance on narrowing a collection", () => {
  it("no longer invites narrowing with the site's own controls first", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).not.toContain("narrow it first with the steps that set the target's own controls");
  });

  it("narrows with a site control only when its words keep exactly what the instruction asks, and otherwise in the read's own condition", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("only when that control's words keep exactly what the instruction asks");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("narrow in the read's own condition, `extractList.where`");
  });

  it("says a condition the items do not print is the site's own filter under a heading naming it, before reading every item", () => {
    const sentence = "When the items do not print a condition the instruction asks for, look first for the site's own filter whose group heading names it, such as Format: Audiobook in a library catalogue, rather than reading every item.";
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain(sentence);
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT.indexOf(sentence)).toBeLessThan(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT.indexOf("Otherwise read the collection and narrow in the read's own condition"));
    expect(sentence).not.toMatch(/shop|store|seller|retailer|pickup|cart|order|feed|social|job|towel|valueridge/iu);
  });
});

describe("what the loop format says exclude and process.columns mean", () => {
  it("says exclude is never stored, process.columns only hides, and a sort or dedupe key must be stored", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT).toContain("`handling: \"exclude\"` is never stored");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT).toContain("`process.columns` keeps a field stored but leaves it out of the answer");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT).toContain("A sort or dedupe key must be stored");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT).not.toContain("over the columns `recordOutput.columns` saves");
  });
});

describe("the act grammar without client worked examples", () => {
  it("keeps choice, optional-step, wait and sending rules ahead of any examples", () => {
    const text = AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE;
    for (const rule of [
      "A choice is written as the state it leaves, not as a press. A press toggles: pressing an option the page already shows chosen un-chooses it.",
      "An option in a dropdown is `node: web.dom.select`",
      "is `node: web.dom.check` on that control itself, `checked: true` to choose it or `checked: false` to clear it; it presses only when the state differs",
      "Never look for a hidden box behind a swatch or chip: check the swatch or chip itself.",
      "Every option the instruction asks for gets its own step, even one the page arrives with already chosen",
      "Press an option with `node: web.dom.click` only when the page shows no chosen state for it at all",
      "Do not end the Flow with a check you invented to confirm it worked",
      "It waits only for something the page visibly showed after that act while you gathered evidence",
      "`optional: yes` marks a step that is only sometimes needed",
      "never on one the answer depends on, and never beside an `on <port>:` line"
    ]) expect(text).toContain(rule);
    expect(text).not.toContain("never inside a repeat");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("A typing step with `submit: true` sends its form, so it presses and needs the line too");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).not.toContain("A step that types, chooses, waits or reads never needs it.");
  });
});

const lead = 'Return the finished Flow under "flow" and one sentence about it under "summary". ';

describe("completion schema client examples", () => {
  it("keeps all four default constants and the default completion free of worked-example tails", () => {
    for (const text of [AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT]) {
      expect(text).not.toMatch(/^Example/m);
      expect(text).not.toMatch(/^flow: /m);
    }
    expect(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA.description).toBe(lead + AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT);
    expect(automationStudioEvidenceFlowBootstrapCompletionSchema()).toEqual(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA);
  });

  it("keeps omitted, empty and unrelated sections example-free", () => {
    for (const examples of [undefined, { version: "archive.v1" }, { version: "archive.v2", format: [] }, { version: "archive.v3", act: ["ACT EXAMPLE"], loop: ["LOOP EXAMPLE"], state: ["STATE EXAMPLE"] }]) {
      expect(automationStudioEvidenceFlowBootstrapCompletionSchema(undefined, examples)).toEqual(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA);
    }
  });

  it("renders only explicit base examples and preserves the existing size argument", () => {
    const size = automationStudioFlowBootstrapSizeLimits(150);
    const format = ["Example: inspect an archive", "  node: archive.document.inspect", ""];
    const schema = automationStudioEvidenceFlowBootstrapCompletionSchema(size, { version: "archive.v1", format, act: ["UNUSED ACT"], loop: ["UNUSED LOOP"], state: ["UNUSED STATE"] });
    expect(schema.description).toBe(lead + AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT + "\n" + format.join("\n"));
    expect(((schema.properties as JsonObject).flow as JsonObject).maxLength).toBe(size.maxResultBytes);
    const { description: _withExamples, ...rest } = schema;
    const { description: _withoutExamples, ...expected } = automationStudioEvidenceFlowBootstrapCompletionSchema(size);
    expect(rest).toEqual(expected);
    expect(automationStudioEvidenceFlowBootstrapCompletionSchema().description).not.toContain("archive.document.inspect");
  });
});
