import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../action-permissions/index.ts";
import { AutomationStudioNodeRegistry, type AutomationNodeParameter, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { automationStudioPlanStepConsequences } from "../../../llm/harness-options/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, parseAutomationStudioFlowScript } from "../../authoring/index.ts";
import {
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA,
  AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE,
  AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT
} from "../index.ts";
import { savedFlowValidation, webDomainNodeDefinitionsFixture } from "./index.ts";

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
  // Typing takes the domain's `submit` (t378), which the fixture's copy predates.
  const registry = new AutomationStudioNodeRegistry();
  for (const definition of webDefinitionsWithSubmit()) registry.register(definition);
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

  it("builds as written: a banner closed if it shows, a search sent, a result opened, a chip set, a status chosen, an estimate typed, and last a press that declares modify_existing", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: example }, registry, resolution });
    expect(accepted.ok ? accepted.issues.filter((issue) => issue.severity === "error") : accepted.issues).toEqual([]);
    const nodes = accepted.ok ? accepted.plan.subflows[0]?.nodes ?? [] : [];
    expect(nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "web.output.dom-click", "builtin.control.merge", "web.output.dom-type", "web.output.dom-click",
      "web.output.dom-check", "web.output.dom-select", "web.output.dom-type", "web.output.dom-click"
    ]);
    const presses = nodes.filter((node) => node.definitionId === "web.output.dom-click");
    expect(presses.map((node) => node.consequences)).toEqual([[], [], ["modify_existing"]]);
    // t378: the search sends its form, so it declares, and declares none.
    expect(nodes[3]?.parameters).toMatchObject({ submit: true });
    expect(nodes[3]?.consequences).toEqual([]);
    // The estimate is typed and not sent, so it declares nothing.
    expect(nodes[7]?.consequences).toBeUndefined();
    // The priority chip is set, never pressed: a press would toggle a chip the page arrived with chosen.
    expect(nodes[5]?.parameters).toMatchObject({ checked: true });
    // The banner's failed way out joins the path its success takes, which is what the runtime skips past.
    const edges = accepted.ok ? accepted.plan.subflows[0]?.edges ?? [] : [];
    expect(edges.filter((edge) => edge.source.nodeKey === "s2").map((edge) => `${edge.source.portId}->${edge.target.nodeKey}`).sort()).toEqual(["failed->s3", "success->s3"]);
  });

  it("carries the consequence line on every press in the example, because a model copies the example", () => {
    const steps = example.split(/\n(?=step)/u);
    const presses = steps.filter((step) => step.includes("node: web.dom.click") || step.includes("submit: true"));
    expect(presses.length).toBe(4);
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
    // t378: an optional step may now stand inside a repeat (`loop-format.test.ts`).
    expect(guidance).toContain("never on one the answer depends on, and never beside an `on <port>:` line");
    expect(guidance).not.toContain("never inside a repeat");
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

  // t378 changed legacy deliberately, by one clause: the consequence sentence
  // said a typing step never needs the line, and the web domain asks it of one
  // with `submit: true` (lane B's refused script). Both digests moved with it.
  it("are unchanged by candidate-only text", () => {
    expect(digest(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT)).toBe("fbc8bfdb47b58003017b09e7fbe52daed7607db1a00bcae3ff8cae958987f87d");
    expect(digest(JSON.stringify(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA))).toBe("4158085b471a9c70072be180acdfaca04fb79787ede5f56e42635709b5176965");
  });
});

// Every example a model is shown, in all three constants, against the checks
// it will meet (t378). A model copies the example, and lanes copied text the
// checks then refused: lane B's sent search had no consequence line, because
// the format said a typing step never needs one. So each block must parse and
// assemble with no error, and each step that presses -- a click, or typing that
// sends its form -- must carry the line.
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const SUBMIT: AutomationNodeParameter = { id: "submit", label: "Send Form After Typing", valueType: "boolean", defaultValue: false };

/** The fixture's web library, with typing taking the domain's `submit` (`domain/src/output-nodes/definitions.ts`). */
function webDefinitionsWithSubmit(): AutomationStudioNodeDefinition[] {
  return webDomainNodeDefinitionsFixture().map((definition) => definition.id === "web.output.dom-type" ? { ...definition, parameters: [...definition.parameters, SUBMIT] } : definition);
}

/** That library with a press taking a row and Next page as the domain declares it, as `loop-format.test.ts` builds it. */
function exampleRegistry(): AutomationStudioNodeRegistry {
  const fixture = webDefinitionsWithSubmit();
  const click = fixture.find((definition) => definition.id === "web.output.dom-click")!;
  const nextPage: AutomationStudioNodeDefinition = {
    ...click,
    id: "web.output.dom-next_page",
    label: "Next Page",
    description: "Go to the list's next page, and answer ended when there is none.",
    source: { kind: "importer", domainId: "web-automation", packageId: "@fluxiq-web-extension/domain", implementationKey: "web.dom.next_page" },
    outputAction: { fixedOutputId: "web.dom.next_page" },
    parameters: [{ id: "nextPage", label: "Next page", valueType: "object", ui: { control: "value" } }],
    outputs: [...click.outputs, { id: "ended", label: "Ended", valueType: "any", role: "branch" }]
  };
  const registry = new AutomationStudioNodeRegistry();
  for (const definition of [...fixture.map((definition) => definition.id === click.id ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition), nextPage]) registry.register(definition);
  // The Call Subflow and handler nodes the state-aware examples lower into (t388) are built-ins.
  return registry;
}

const EXAMPLE_RESOLUTION = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

/** Each `Example...:` block of a constant, as the script it shows. */
function exampleBlocks(text: string): Array<[string, string]> {
  const found: Array<[string, string[]]> = [];
  for (const line of text.split("\n")) {
    if (/^Example\b.*:$/u.test(line)) found.push([line, []]);
    else found.at(-1)?.[1].push(line);
  }
  return found.map(([name, lines]) => [name, lines.join("\n")]);
}

describe("every example in the Flow script format", () => {
  const registry = exampleRegistry();
  const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const blocks = [AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT].flatMap(exampleBlocks);

  it("finds every example of the four constants", () => {
    expect(blocks.map(([name]) => name)).toEqual([
      "Example:", "Example, narrowing before reading:", "Example, two situations the run can start in:",
      "Example, acting on one item:",
      "Example, reading every page of a list:", "Example, acting on each row a listing kept:", "Example, a loop the site asked to slow down:",
      "Example, starting where the page already is:", "Example, an interruption that can come at any pass:", "Example, a second known way, checked the same:"
    ]);
  });

  it.each(blocks)("%s parses and assembles with no error", (_name, script) => {
    expect(parseAutomationStudioFlowScript(script).issues.filter((issue) => issue.severity === "error")).toEqual([]);
    // The acceptor is the one door that assembles a parsed script; `assemble.ts` stays behind the barrel.
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: script }, registry, resolution });
    expect(accepted.ok ? accepted.issues.filter((issue) => issue.severity === "error") : accepted.issues).toEqual([]);
  });

  it.each(blocks)("%s declares consequences on every step that presses or sends a form", (_name, script) => {
    for (const step of script.split(/\n(?=\s*step)/u)) {
      const lines = step.split("\n").map((line) => line.trim());
      const presses = lines.includes("node: web.dom.click") || (lines.includes("node: web.dom.type") && lines.includes("submit: true"));
      if (presses) expect(lines.some((line) => line.startsWith("consequences:")), step).toBe(true);
    }
  });

  it("no longer says a typing step never needs the line, and says one that sends its form does", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).not.toContain("A step that types, chooses, waits or reads never needs it.");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).toContain("A typing step with `submit: true` sends its form, so it presses and needs the line too: `consequences: none` for a search.");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE).toMatch(/node: web\.dom\.type\n {2}target: t1\n {2}text: budget review\n {2}submit: true\n {2}consequences: none/u);
  });

  // t378: the candidate examples had become the live lanes' own tasks (a cart with a colour and a size,
  // earbuds under 50 on every page, friend requests confirmed per row), so a lane could pass on the example's
  // shape of its own answer. An example teaches a shape on a site and an act no Lab task has; these are the
  // realistic scenarios' sites, goods and acts, and none may appear in a script the model is shown.
  it.each(blocks)("%s shows no realistic Lab scenario's site or task", (_name, script) => {
    const LAB_TASK_WORDS = /friend|request|earbud|kettle|basket|cart\b|towel|napkin|dish soap|pickup|watchlist|bid\b|auction|coupon|connection|invitation|saved item|classified|giveaway|glaze|moon jar|quote|gas engineer|job|rust role|group post|feed|digest|open day|rating|shirt|colour|size\b|quantity|brightaisle|farbazaar|valueridge|kerbfind|guildline|hammerline|circleway|voltbay|tidewell/iu;
    expect(script.match(LAB_TASK_WORDS)?.[0]).toBeUndefined();
  });
});

// The state-aware statements (t388, contract C12): one line each, with a
// one-line example, then three worked examples -- an entry where the page
// already is, an interruption that can come at any pass, and a second known way
// checked the same -- each assembled here to the graph shape the contract
// stores. Candidate-only, so the legacy schema the digests above pin is
// untouched.
describe("the state-aware Flow script format", () => {
  const registry = exampleRegistry();
  const examples = new Map(exampleBlocks(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT));
  const planOf = (name: string) => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: examples.get(name)! }, registry, resolution: EXAMPLE_RESOLUTION });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    return accepted.plan;
  };

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

  it("starting where the page already is: the renewal step carries its entry and the Flow requires facts", () => {
    const plan = planOf("Example, starting where the page already is:");
    const main = plan.subflows[0]!;
    expect(main.nodes.map((node) => node.metadata ? `${node.key} ${Object.keys(node.metadata).join(",")}` : node.key)).toEqual(["s1", "s2", "s3 fluxiq.entry", "s4", "s5"]);
    expect(main.nodes[2]!.metadata?.["fluxiq.entry"]).toEqual({ id: "renew", order: 1, when: [{ fact: "exists", op: "exists", target: { handle: "t6" } }], requires: [] });
    expect(plan.metadata).toEqual({ requires: ["web.facts@1"] });
  });

  it("an interruption that can come at any pass: one automation-scope handler in the recovery Subflow, beside the loop", () => {
    const plan = planOf("Example, an interruption that can come at any pass:");
    expect(plan.subflows.map((subflow) => [subflow.key, subflow.role])).toEqual([["main", "primary"], ["recovery", "recovery"]]);
    const recovery = plan.subflows[1]!;
    expect(recovery.nodes.map((node) => node.definitionId)).toEqual(["builtin.control.handler", "web.output.dom-click", "builtin.control.handler-end"]);
    expect(recovery.nodes[0]!.parameters).toMatchObject({
      event: "before",
      scope: { kind: "automation" },
      when: [{ fact: "dialog", op: "visible", target: { kind: "dialog", role: "alertdialog", name: "Session expiring" } }],
      completionCheck: [{ fact: "dialog", op: "absent", target: { kind: "dialog", role: "alertdialog", name: "Session expiring" } }]
    });
    expect(recovery.nodes[2]!.parameters).toEqual({ disposition: "resume", checkpointId: "", outputs: {} });
    expect(plan.subflows[0]!.nodes.map((node) => node.definitionId)).toContain("builtin.control.for-each");
    expect(plan.metadata).toEqual({ requires: ["flow.handlers@1", "web.facts@1"] });
  });

  it("a second known way, checked the same: two parts with one success check, the call, and a fail handler that calls the other and resolves", () => {
    const plan = planOf("Example, a second known way, checked the same:");
    expect(plan.subflows.map((subflow) => [subflow.key, subflow.role])).toEqual([["main", "primary"], ["calendar", "utility"], ["floorplan", "utility"]]);
    const [main, calendar, floorplan] = plan.subflows;
    expect(main!.nodes.map((node) => `${node.key} ${node.definitionId}`)).toEqual([
      "s1 web.output.browser-navigate", "s2 builtin.control.call-subflow",
      "h1-s1 builtin.control.handler", "h1-s2 builtin.control.call-subflow", "h1-s3 builtin.control.handler-end"
    ]);
    expect(main!.nodes[1]!.parameters).toEqual({ subflowId: "calendar", inputs: {}, outputs: { reference: "reference" }, errors: {} });
    expect(main!.nodes[2]!.parameters).toMatchObject({ event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [], completionCheck: [] });
    expect(main!.nodes[3]!.parameters).toMatchObject({ subflowId: "floorplan" });
    expect(main!.nodes[4]!.parameters).toEqual({ disposition: "resolve", checkpointId: "", outputs: { reference: { $state: { path: "$node.h1-s2.reference" } } } });
    const check = [{ fact: "text", op: "contains", value: "Booked", target: { handle: "t11" } }];
    expect(calendar!.metadata?.["fluxiq.successCheck"]).toEqual(check);
    expect(floorplan!.metadata?.["fluxiq.successCheck"]).toEqual(check);
    expect(calendar!.interface?.outputs.map((port) => port.metadata?.binding)).toEqual([{ $state: { path: "$node.s2.records" } }]);
    expect(plan.metadata).toEqual({ requires: ["flow.handlers@1", "flow.subflow-calls@1", "web.facts@1"] });
  });
});

// Every example, saved as the Flow apply writes and held to the Flow's own
// validation (t388): the plan validator, then `model/validation/flow.ts` on
// each graph with its Subflow's role -- a handler's scope, body and end, its
// disposition at its event, a route's checkpoint (C4, C5). The web fixture asks
// a press for a `selector`; the real domain takes the handle the examples
// write instead, so the selector is optional here, and nothing else is eased.
describe("every example in the Flow script format, saved as a Flow", () => {
  const base = exampleRegistry();
  const registry = new AutomationStudioNodeRegistry(base.list(EXAMPLE_RESOLUTION).map((definition) => ({
    ...definition,
    parameters: definition.parameters.map((parameter) => parameter.id === "selector" ? { ...parameter, required: false } : parameter)
  })));
  const blocks = [AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT].flatMap(exampleBlocks);

  it.each(blocks)("%s passes the plan validator and the Flow validator on every graph", (_name, script) => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: script }, registry, resolution: EXAMPLE_RESOLUTION });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    const saved = savedFlowValidation(accepted.plan, registry, EXAMPLE_RESOLUTION);
    expect(saved.errors).toEqual([]);
    expect(saved.topology).toBeDefined();
  });

  it("writes the second known way's parts, handler and requirements to the saved graphs, by the ids it minted", () => {
    const script = new Map(exampleBlocks(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT)).get("Example, a second known way, checked the same:")!;
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: script }, registry, resolution: EXAMPLE_RESOLUTION });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    const topology = savedFlowValidation(accepted.plan, registry, EXAMPLE_RESOLUTION).topology!;
    const byKey = new Map(topology.subflows.map((entry) => [entry.subflow.metadata?.bootstrapSymbolicKey, entry]));
    const main = byKey.get("main")!.graphFlow;
    const calls = main.nodes.filter((node) => node.definitionId === "builtin.control.call-subflow").map((node) => node.parameterValues?.subflowId);
    // The layout orders a graph's nodes, so the calls are compared as a set.
    expect([...calls].sort()).toEqual([byKey.get("calendar")!.subflow.subflowId, byKey.get("floorplan")!.subflow.subflowId].sort());
    const handler = main.nodes.find((node) => node.definitionId === "builtin.control.handler")!;
    const booking = main.nodes.find((node) => node.metadata?.bootstrapSymbolicKey === "s2")!;
    expect(handler.parameterValues?.scope).toEqual({ kind: "nodes", nodeIds: [booking.id] });
    const calendar = byKey.get("calendar")!.graphFlow;
    expect(calendar.interface.outputs.map((port) => [port.id, port.metadata?.binding])).toEqual([["reference", { $state: { path: "$node.s2.records" } }]]);
    expect(calendar.metadata?.["fluxiq.successCheck"]).toEqual([{ fact: "text", op: "contains", value: "Booked", target: { handle: "t11" } }]);
    expect(calendar.metadata?.requires).toEqual(["web.facts@1"]);
    expect(main.metadata?.requires).toEqual(["flow.handlers@1", "flow.subflow-calls@1"]);
    expect(topology.requires).toEqual(["flow.handlers@1", "flow.subflow-calls@1", "web.facts@1"]);
    // A part is no router target and not the fallback; the recovery role is not used here.
    expect(topology.router.rules).toEqual([]);
    expect(topology.router.fallback).toEqual({ kind: "subflow", subflowId: byKey.get("main")!.subflow.subflowId });
  });

  it("writes an entry to the saved node, and an everywhere handler to the recovery graph", () => {
    const examples = new Map(exampleBlocks(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT));
    const entry = acceptAutomationStudioFlowBootstrapResult({ result: { flow: examples.get("Example, starting where the page already is:")! }, registry, resolution: EXAMPLE_RESOLUTION });
    if (!entry.ok) throw new Error(JSON.stringify(entry.issues));
    const renew = savedFlowValidation(entry.plan, registry, EXAMPLE_RESOLUTION).topology!.subflows[0]!.graphFlow.nodes.find((node) => node.metadata?.["fluxiq.entry"]);
    expect(renew?.metadata?.["fluxiq.entry"]).toEqual({ id: "renew", order: 1, when: [{ fact: "exists", op: "exists", target: { handle: "t6" } }], requires: [] });
    const anywhere = acceptAutomationStudioFlowBootstrapResult({ result: { flow: examples.get("Example, an interruption that can come at any pass:")! }, registry, resolution: EXAMPLE_RESOLUTION });
    if (!anywhere.ok) throw new Error(JSON.stringify(anywhere.issues));
    const recovery = savedFlowValidation(anywhere.plan, registry, EXAMPLE_RESOLUTION).topology!.subflows.find((saved) => saved.subflow.role === "recovery")!;
    expect(recovery.graphFlow.nodes.map((node) => node.definitionId)).toEqual(["builtin.control.handler", "web.output.dom-click", "builtin.control.handler-end"]);
    expect(recovery.graphFlow.metadata?.requires).toEqual(["flow.handlers@1", "web.facts@1"]);
  });
});
