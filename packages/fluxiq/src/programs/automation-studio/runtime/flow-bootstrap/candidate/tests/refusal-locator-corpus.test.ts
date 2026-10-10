// Every refusal a candidate submission can get names the step it is about
// (t378). Enforced, not hoped for: a corpus of scripts, each refused at one
// stage -- parse, assembly, an optional step, a repeat, the bindings, the
// domain's resolution, registry validation -- is submitted through the real
// controller and read back exactly as the model is shown it
// (`automationStudioCandidateSubmissionRefusal`). An issue without its `line`
// and `step` fails here unless its code is about the whole Flow
// (`WHOLE_FLOW`).
//
// And the corpus cannot fall behind: every refusal code the authoring source
// and the statements beside it (`../../script-statements/`) can raise must be
// met by a case here, be about the whole Flow, or be one a written script
// never reaches (`NOT_FROM_A_SCRIPT`, each with why). A new code
// with none of the three fails the source scan below.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { AutomationStudioFlowCandidateSubmissionController, automationStudioCandidateSubmissionRefusal } from "../index.ts";
import { refusalTestRegistry, refusalTestSubmission } from "./refusal-domain-fixture.ts";

/** Codes about the whole Flow, or the library, rather than one step: they are the only ones that may reach the model without a line. */
const WHOLE_FLOW: ReadonlySet<string> = new Set([
  "flow_script.no_steps",
  "flow_script.too_many_lines",
  "flow_script.repeat_unavailable",
  "bootstrap.invalid_plan"
]);

/** Codes the authoring source raises that a written script never reaches, and why. */
const NOT_FROM_A_SCRIPT: Readonly<Record<string, string>> = {
  // Warnings: a script carrying them is accepted, so they are never a refusal.
  "flow_script.unrecognized_line": "a warning",
  "flow_script.run_subflow_ignored": "a warning",
  "record_output.dropped_key": "a warning",
  "record_output.named_column_unmatched": "a warning",
  // A JSON plan's shapes (`../../authoring/json-plan.ts`, `plan-shapes.ts`): a JSON plan has no lines, and names its node.
  "bootstrap.invalid_subflows": "a JSON plan's shape",
  "bootstrap.subflow_has_no_nodes": "a JSON plan's shape",
  "bootstrap.invalid_node": "a JSON plan's shape",
  "bootstrap.definition_unavailable": "a JSON plan's shape",
  // A script's loops are always bounded by the For Each or Repeat its repeat lines become.
  "flow_draft.loop_unbounded": "a JSON plan's cycle",
  // A `$step.<label>` binding names a labelled step of its own block, which always becomes a node.
  "flow_draft.step_binding_source_missing": "a draft's or JSON plan's dangling reference",
  // A draft's routing and inputs (`../../authoring/draft-routing.ts`, `assemble-draft.ts`): a candidate is never a draft.
  "flow_draft.no_steps": "a draft",
  "flow_draft.routing_unavailable": "a draft",
  "flow_draft.step_not_written": "a draft",
  "flow_draft.check_not_before_step": "a draft",
  "flow_draft.recovery_behind_step": "a draft",
  "flow_draft.recovery_is_routed": "a draft",
  "flow_draft.repeat_span_unknown": "a draft",
  "flow_draft.repeat_not_after_its_source": "a draft",
  "flow_draft.repeat_body_is_routed": "a draft",
  "flow_draft.repeat_while_never_ends": "a draft",
  "flow_draft.input_conflict": "a draft"
};

/** A Flow script: the lines, each step opening on a page. */
const open = ["step: open the shop", "  node: web.browser.navigate", "  url: https://shop.test/"];
const click = (label: string, extra: string[] = []) => [`step ${label}: press ${label}`, "  node: web.dom.click", `  selector: .${label}`, "  consequences: none", ...extra];
const list = (label: string) => [`step ${label}: read the ${label}`, "  node: web.dom.extract_list", `  extractList: {"item": ".row", "fields": {"name": ".name"}}`];
const wait = (label: string, extra: string[] = []) => [`step ${label}: wait for ${label}`, "  node: web.dom.wait_for_selector", `  selector: .${label}`, ...extra];

/** A step whose node takes one of two output actions and leaves the choice to the step. */
function choosingDefinition(): AutomationStudioNodeDefinition {
  const base = webDomainNodeDefinitionsFixture().find((definition) => definition.id === "web.output.dom-click")!;
  return { ...base, id: "web.output.dom-choose", label: "Choose Way", description: "Choose one of two ways.", outputAction: { allowedOutputIds: ["web.dom.click", "web.dom.select"] } };
}

type CorpusCase = { name: string; lines: string[]; codes: string[]; registry?: ReturnType<typeof refusalTestRegistry> };

/**
 * The state-aware statements (t388): a library that can call a part -- Call
 * Subflow is a built-in, so every default library can -- and a part with one
 * input, and a handler for the step labelled `rows`.
 */
const calling = () => refusalTestRegistry();
const part = (label: string, extra: string[] = []) => [`part ${label}: renew one loan`, "  input: card", ...extra, ...click(`${label}-go`).map((line) => `  ${line}`), "end"];
const handler = (header: string, lines: string[]) => [...list("rows"), header, ...lines, "end"];

const CORPUS: CorpusCase[] = [
  // Parse.
  { name: "a script with no step", lines: ["flow: nothing to do"], codes: ["flow_script.no_steps"] },
  { name: "a script longer than a script may be", lines: Array.from({ length: 2_001 }, () => "# filler"), codes: ["flow_script.too_many_lines"] },
  // Assembly: nodes and parameters.
  { name: "a step naming no node", lines: [...open, "step: float away", "  node: web.dom.levitate"], codes: ["flow_script.unknown_node"] },
  { name: "a parameter no node declares", lines: [...open, ...click("buy", ["  zzqqxx: 1"])], codes: ["bootstrap.unknown_parameter"] },
  { name: "a value its parameter refuses", lines: [...open, ...click("buy", ["  timeoutMs: soon"])], codes: ["bootstrap.invalid_parameter_value"] },
  { name: "consequences that are not a declaration", lines: [...open, "step: press buy", "  node: web.dom.click", "  selector: .buy", `  consequences: ${"x".repeat(50)}`], codes: ["bootstrap.invalid_consequences"] },
  { name: "a node whose output action is left unchosen", lines: [...open, "step: choose a way", "  node: web.output.dom-choose", "  selector: .way", "  consequences: none"], codes: ["bootstrap.missing_output_action"], registry: refusalTestRegistry([choosingDefinition()]) },
  { name: "a label used twice", lines: [...open, ...click("buy"), ...click("buy")], codes: ["flow_script.duplicate_label"] },
  { name: "a binding that names nothing", lines: [...open, "step: type the name", "  node: web.dom.type", "  selector: #q", "  text: $row.bad field"], codes: ["flow_script.invalid_binding"] },
  // Assembly: blocks and routes.
  { name: "a step running a block nobody declared", lines: [...open, "step: run subflow nowhere"], codes: ["flow_script.unknown_block"] },
  // Since t388 a step that runs a block with no `when:` calls it as a part, which this library cannot.
  { name: "a step calling a part in a library with no Call Subflow", lines: [...open, "step: run subflow sale", "subflow sale: The sale", ...click("deal")], codes: ["flow_script.call_unavailable"], registry: refusalTestRegistry([], ["builtin.control.call-subflow"]) },
  { name: "a block with no condition that no step calls", lines: [...open, "subflow sale: The sale", ...click("deal")], codes: ["flow_script.subflow_unreachable"] },
  { name: "a condition outside every block", lines: [...open, "when: state.page.url contains /sale", ...click("buy")], codes: ["flow_script.when_outside_block"] },
  { name: "a condition that cannot be read", lines: [...open, "subflow sale: The sale", "  when: the sale is on", ...click("deal")], codes: ["flow_script.invalid_condition"] },
  // Assembly: branches.
  { name: "a branch on a port the node lacks", lines: [...open, ...click("buy", ["  on sideways: go to done"]), ...click("done")], codes: ["flow_script.unknown_port"] },
  { name: "a branch to no label", lines: [...open, ...click("buy", ["  on failed: go to nowhere"]), ...click("done")], codes: ["flow_script.unknown_label"] },
  { name: "a branch into another block", lines: [...open, ...click("buy", ["  on failed: go to deal"]), "subflow sale: The sale", "  when: state.page.url contains /sale", ...click("deal")], codes: ["flow_script.branch_across_blocks"] },
  { name: "a branch to the step written next", lines: [...open, ...click("buy", ["  on failed: go to done"]), ...click("done")], codes: ["flow_script.branch_to_next_step"] },
  // Optional steps.
  { name: "an optional line that is neither yes nor no", lines: [...open, ...click("banner", ["  optional: maybe"])], codes: ["flow_script.optional_invalid"] },
  { name: "an optional step that also branches", lines: [...open, ...click("banner", ["  optional: yes", "  on failed: go to done"]), ...click("next"), ...click("done")], codes: ["flow_script.optional_misplaced"] },
  { name: "an optional step in a library with no join", lines: [...open, ...click("banner", ["  optional: yes"])], codes: ["flow_script.optional_unavailable"], registry: refusalTestRegistry([], ["builtin.control.merge"]) },
  { name: "an optional step that ends a repeat while span", lines: [...open, ...click("more", ["  repeat while: banner", "  repeat most: 3"]), ...click("banner", ["  optional: yes"])], codes: ["flow_script.optional_misplaced"] },
  // Steps that run only after an optional step (t378).
  { name: "an only after naming a step that is not optional", lines: [...open, ...click("notice"), ...click("again", ["  only after: notice"])], codes: ["flow_script.only_after_misplaced"] },
  { name: "an only after not written directly after its optional step", lines: [...open, ...click("notice", ["  optional: yes"]), ...click("other"), ...click("again", ["  only after: notice"])], codes: ["flow_script.only_after_misplaced"] },
  { name: "an only after in another span than its optional step", lines: [...open, ...list("rows"), ...click("buy", ["  repeat over: rows", "  repeat through: notice"]), ...click("notice", ["  optional: yes"]), ...click("again", ["  only after: notice"])], codes: ["flow_script.only_after_misplaced"] },
  // Repeats.
  { name: "a repeat in a library that cannot repeat", lines: [...open, ...list("rows"), ...click("buy", ["  repeat over: rows"])], codes: ["flow_script.repeat_unavailable"], registry: refusalTestRegistry([], ["builtin.control.for-each"]) },
  { name: "a repeat that says nothing of what repeats it", lines: [...open, ...click("more", ["  repeat through: more"])], codes: ["flow_script.repeat_invalid"] },
  { name: "a repeat ending at no step", lines: [...open, ...click("more", ["  repeat while: ghost"])], codes: ["flow_script.repeat_span_unknown"] },
  { name: "a repeat inside a repeat", lines: [...open, ...list("rows"), ...click("more", ["  repeat while: check", "  repeat most: 3"]), ...click("buy", ["  repeat over: rows"]), ...wait("check")], codes: ["flow_script.repeat_body_is_routed"] },
  { name: "a branch inside a repeat", lines: [...open, ...click("more", ["  repeat while: check", "  repeat most: 3"]), ...click("buy", ["  on failed: go to done"]), ...wait("check"), ...click("done")], codes: ["flow_script.repeat_body_branches"] },
  { name: "a branch into a repeat", lines: [...open, ...click("skip", ["  on failed: go to check"]), ...click("more", ["  repeat while: check", "  repeat most: 3"]), ...wait("check")], codes: ["flow_script.branch_into_repeat"] },
  { name: "a repeat while a step that never ends it", lines: [...open, ...click("more", ["  repeat while: check"]), ...wait("check")], codes: ["flow_script.repeat_while_never_ends"] },
  { name: "a repeat over a listing written after it", lines: [...open, ...click("buy", ["  repeat over: rows"]), ...list("rows")], codes: ["flow_script.repeat_not_after_its_source"] },
  { name: "a repeat most no span can take", lines: [...open, ...click("more", ["  repeat most: 3"])], codes: ["flow_script.repeat_most_misplaced"] },
  { name: "a repeat pace no span can take", lines: [...open, ...click("more", ["  repeat pace: 6 s"])], codes: ["flow_script.repeat_pace_misplaced"] },
  { name: "a repeat pace that is not a time", lines: [...open, ...list("rows"), ...click("buy", ["  repeat over: rows", "  repeat pace: soon"])], codes: ["flow_script.repeat_pace_invalid"] },
  // The candidate's binding checks.
  { name: "a row read outside every loop", lines: [...open, "step: type the name", "  node: web.dom.type", "  selector: #q", "  text: $row.name"], codes: ["flow_draft.row_binding_outside_loop"] },
  { name: "a row field the listing does not read", lines: [...open, ...list("rows"), "step: type the colour", "  node: web.dom.type", "  selector: #q", "  text: $row.colour", "  repeat over: rows"], codes: ["flow_draft.row_binding_unknown_field"] },
  { name: "a Flow input named after a step's output", lines: [...open, "step: type the name", "  node: web.dom.type", "  selector: #q", "  text: $input.success = towels"], codes: ["flow_draft.input_shadowed"] },
  { name: "a step reading an output of a later step", lines: [...open, "step: type the name", "  node: web.dom.type", "  selector: #q", "  text: $step.read.records", ...list("read")], codes: ["flow_draft.step_binding_not_earlier"] },
  { name: "a step reading an output its source lacks", lines: [...open, ...list("read"), "step: type the name", "  node: web.dom.type", "  selector: #q", "  text: $step.read.colour"], codes: ["flow_draft.step_binding_unknown_output"] },
  { name: "a step reading the output of a step the Flow may go round", lines: [...open, ...wait("check", ["  on failed: go to join"]), ...list("read"), "step join: the paths meet", "  node: builtin.control.merge", "step: type the name", "  node: web.dom.type", "  selector: #q", "  text: $step.read.records"], codes: ["flow_draft.step_binding_conditional_source"] },
  { name: "a step reading a repeated step's output from outside its loop", lines: [...open, ...click("more", ["  repeat while: next"]), "step next: go to the next page", "  node: web.dom.next_page", "  consequences: none", "step: type the name", "  node: web.dom.type", "  selector: #q", "  text: $step.next.success"], codes: ["flow_draft.step_binding_repeated_source"] },
  // The domain's resolution.
  { name: "a press that says nothing of what it does", lines: [...open, "step: press buy", "  node: web.dom.click", "  selector: .buy"], codes: ["web.step.consequences_undeclared", "web.step.expected.consequences_classes_or_none"] },
  { name: "a handle no view printed", lines: [...open, "step: press buy", "  node: web.dom.click", "  target: t9001", "  consequences: modify_existing"], codes: ["web.handle.unknown", "web.handle.unknown:target"] },
  // Registry validation.
  { name: "a step missing a parameter its node requires", lines: [...open, "step: press buy", "  node: web.dom.click", "  consequences: none"], codes: ["bootstrap.missing_parameter"] },
  // Parts a step calls (t388).
  { name: "a call to a situation block", lines: [...open, "step: renew", "  call: sale", "subflow sale: The sale", "  when: state.page.url contains /sale", ...click("deal")], codes: ["flow_script.call_situation"], registry: calling() },
  { name: "a call that also names a node", lines: [...open, "step: renew", "  node: web.dom.click", "  call: renewal", "  card: 1", ...part("renewal")], codes: ["flow_script.call_misplaced"], registry: calling() },
  { name: "a call giving an input the part lacks", lines: [...open, "step: renew", "  call: renewal", "  card: 1", "  colour: red", ...part("renewal")], codes: ["flow_script.call_unknown_input"], registry: calling() },
  { name: "a call missing an input the part declares", lines: [...open, "step: renew", "  call: renewal", ...part("renewal")], codes: ["flow_script.call_input_missing"], registry: calling() },
  { name: "a part that calls itself", lines: [...open, "step: renew", "  call: renewal", "  card: 1", ...part("renewal", ["  step: again", "    call: renewal", "    card: 1"])], codes: ["flow_script.call_cycle"], registry: calling() },
  { name: "an input on a block no step calls", lines: [...open, "input: card", ...click("go")], codes: ["flow_script.part_interface_invalid"] },
  // Entries and checkpoints (t388).
  { name: "a start at naming no step", lines: [...open, "start at: nowhere", "when: exists t1", ...click("go")], codes: ["flow_script.entry_invalid"] },
  { name: "a checkpoint line that is neither yes nor no", lines: [...open, ...click("go", ["  checkpoint: perhaps"])], codes: ["flow_script.checkpoint_invalid"] },
  // Handlers (t388).
  { name: "a handler for a step that is not there", lines: [...open, ...handler("on retry for nowhere: a notice", ["  when: exists t1", "  then: carry on"])], codes: ["flow_script.handler_invalid"] },
  { name: "a handler carrying on after a failure", lines: [...open, ...handler("on fail for rows: no rows", ["  then: carry on"])], codes: ["flow_script.handler_then_invalid"] },
  { name: "a retry handler that cannot say it worked", lines: [...open, ...handler("on retry for rows: a notice", ["  when: text t1 contains \"wait\"", "  then: carry on"])], codes: ["flow_script.handler_check_missing"] },
  { name: "a handler fact that cannot be read", lines: [...open, ...handler("on retry for rows: a notice", ["  when: somewhere t1", "  then: carry on"])], codes: ["flow_script.fact_invalid"] },
  { name: "a handler in a library with no handler nodes", lines: [...open, ...handler("on fail for rows: no rows", ["  then: give up"])], codes: ["flow_script.handler_unavailable"], registry: refusalTestRegistry([], ["builtin.control.handler", "builtin.control.handler-end"]) }
];

type Outcome = { name: string; issues: JsonObject[]; expected: string[] };
const outcomes: Outcome[] = [];

beforeAll(async () => {
  for (const corpusCase of CORPUS) {
    const controller = new AutomationStudioFlowCandidateSubmissionController(refusalTestSubmission(corpusCase.registry));
    const submitted = await controller.submit({ summary: corpusCase.name, flow: corpusCase.lines.join("\n") });
    if (submitted.ok) throw new Error(`the corpus case "${corpusCase.name}" was accepted`);
    const evidence = automationStudioCandidateSubmissionRefusal(submitted).evidence;
    outcomes.push({ name: corpusCase.name, issues: ((evidence.diagnostics as JsonObject).issues ?? []) as JsonObject[], expected: corpusCase.codes });
  }
});

describe("every candidate refusal the model sees", () => {
  it("is refused with the codes each corpus case is about", () => {
    for (const outcome of outcomes) {
      const codes = outcome.issues.map((issue) => issue.code);
      expect.soft(codes, outcome.name).toEqual(expect.arrayContaining(outcome.expected));
      expect.soft(codes.length, outcome.name).toBeGreaterThan(0);
    }
  });

  it("names the step it is about, by line and as written, unless it is about the whole Flow", () => {
    const unplaced = outcomes.flatMap((outcome) => outcome.issues
      .filter((issue) => !WHOLE_FLOW.has(String(issue.code)))
      .filter((issue) => typeof issue.line !== "number" || issue.line < 1 || typeof issue.step !== "string" || !issue.step)
      .map((issue) => `${outcome.name}: ${String(issue.code)} at ${String(issue.path)}`));
    expect(unplaced).toEqual([]);
  });
});

describe("the refusal codes the authoring source raises", () => {
  // Every source file that lowers a written script: `authoring/`, and since t378
  // the statements beside it (`script-statements/`: optional, only after,
  // repeat most, repeat pace), subdirectories included and none of the tests.
  const roots = ["../../authoring/", "../../script-statements/"].map((root) => fileURLToPath(new URL(root, import.meta.url)));
  const sources = roots.flatMap((root) => readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.split(/[\\/]/u).includes("tests"))
    .map((name) => join(root, name)));
  const raised = new Set(sources.flatMap((path) =>
    [...readFileSync(path, "utf8").matchAll(/"((?:flow_script|flow_draft|bootstrap|record_output)\.[a-z_]+)"/gu)].map((match) => match[1]!)));

  it("reads the statement sources, so a code raised there is held to the corpus too", () => {
    expect(raised).toContain("flow_script.only_after_misplaced");
    expect(raised).toContain("flow_script.repeat_pace_invalid");
    expect(raised).toContain("flow_script.repeat_most_misplaced");
  });

  it("are each met by a corpus case, about the whole Flow, or never reached by a written script", () => {
    const met = new Set(outcomes.flatMap((outcome) => outcome.issues.map((issue) => String(issue.code))));
    const uncovered = [...raised].filter((code) => !met.has(code) && !WHOLE_FLOW.has(code) && !(code in NOT_FROM_A_SCRIPT)).sort();
    expect(uncovered).toEqual([]);
  });

  it("list no code that is neither raised by the source nor met by the corpus", () => {
    const met = new Set(outcomes.flatMap((outcome) => outcome.issues.map((issue) => String(issue.code))));
    const stale = [...WHOLE_FLOW, ...Object.keys(NOT_FROM_A_SCRIPT)].filter((code) => !raised.has(code) && !met.has(code)).sort();
    expect(stale).toEqual([]);
  });
});
