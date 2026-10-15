// What a model is told about a plan that was refused: each issue by its code
// and plan path, and, for an issue about a node's parameter, the shape that
// parameter accepts.
//
// A refused plan is only worth asking for again if the model can correct it.
// Live Flow creations were refused three times in a row for a record output
// whose keys the model had never been shown, and each refusal named only
// codes, so the model guessed again. The accepted shape is read from the node
// definition the plan names -- the same text its catalog entry carries
// (`./parameter-text.ts`), and for a record output Core's record-set contract
// (`./record-output-contract.ts`) -- so nothing here is page content or a
// validator's prose.
//
// A domain's refusal of a node's parameters is placed at the parameters as a
// whole, and names the parameter at the start of the position its code
// carries (`web.handle.misplaced:extractList.fields.0`); that parameter's shape
// is given for it.
//
// Whole: every issue, each path printable, each authored message whole, and a
// parameter's shape given once however many issues it has. Until 2026-09-30 it
// was at most sixteen issues, paths cut at 300 characters, messages at 400, and
// the shapes held to 3,000 bytes (user: "Remove ANY AND ALL LIMITS ON THE
// NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION").
//
// **A refused handle is named (t356, C3).** Lane A round 4
// (`run-muyrpbnk-fef374e7`, 0037-0068) had twelve submissions refused
// `web.handle.unknown` for `t478` and `t488`, handles printed only on the start
// page, and every refusal named a node index and nothing else, so the model sent
// the same two handles again each time. An issue whose code is about a handle
// now carries `handles`: each handle (and the location beside it, when one was
// written) that the refused node's parameter holds. They are tokens the model
// itself wrote, never page content.
//
// **An issue says what to write instead, where Core can (t378).** Lane B
// (`run-mv0fu9pb-57454dc4`, 0058) was refused `web.step.consequences_undeclared`
// for two steps that typed a search and sent it (`submit: true`); nothing said
// that sending a form is a press, so the model looked for presses. An issue
// whose code says a step's consequences are undeclared now carries `instead`:
// one fixed sentence, quoting nothing but the step's own `submit: true` and
// Core's consequence classes, once per step.
//
// **A refusal that named a field says it (t489).** A domain that refuses a
// step for a field it cannot use may name that field and the names it can use
// (`detail`, read at `../../llm/harness-options/plan-parameter-resolution.ts`).
// Such an issue carries `field` and `valid`, and Core's sentence with its code
// and those names, rebuilt here from the detail alone; the issue's own message
// is never passed for it. Lane D round 13 (`run-mv66sc3c-c47e74b8`) resent one
// script until its build ended, told only that its parameters were refused.
//
// **Core's own sentence is never swapped for that one (t510).** A record
// output's processing refusal now carries the same detail
// (`./record-output-contract.ts`), and its remedy is Core's: a sort key the
// answer should not show is kept stored and hidden with process.columns. The
// domain sentence's "write one of those instead" is the fix breadth wave 1
// (`run-mv6qrbgx-06151cdb`) was wrongly given, so an issue whose code is in
// `AUTHORED_CODES` keeps its message and carries `field` and `valid` beside it.
//
// **A word under the wrong key is answered with its line (t514).** Social gate
// run `run-mv6v2jh4-69244ffb` wrote `state: absent` on a wait step and was
// refused a bare `bootstrap.handle_unresolved` at the step's parameters; it
// sent the same script until the build ended. An issue that says what to write
// instead (`instead`, from `../parameter-words/word-instead.ts`) carries it, and
// an unresolved handle that is a word one of the node's parameters takes is
// answered with that line. Each issue about one of a node's parameters names
// the node (`node`), so the model can ask `core.describe_nodes` what it takes.
//
// **An undeclared parameter is named, every time (t606).** A8 towels
// (`run-mv8p37k8-f1a90624`) was refused `bootstrap.unknown_parameter` for a
// `recordOutput` written on a node that does not take one: each issue came
// back with no message, only the first with the node's parameters, and the
// model sent the same script four times. Each such issue now carries Core's
// sentence naming the key, the node and the parameters it takes -- identifiers
// only, never a value.
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapIssueDetail } from "./contracts.ts";
import { automationStudioFlowBootstrapParameterText } from "./parameter-text.ts";
import { automationStudioFlowBootstrapWordInstead } from "../parameter-words/index.ts";
import { automationStudioFlowBootstrapRecordOutputContract } from "./record-output-contract.ts";
import { AUTOMATION_STUDIO_ROUTE_CONDITION_FORM } from "./route-condition.ts";

/**
 * The refusals about routes. A code and a line number do not say how to write
 * a condition, and a route refused twice for the same reason ends a build, so
 * each carries its message -- Core's own words, plus at most the model's own
 * condition text quoted back -- and the form a condition takes.
 */
/**
 * The refusals whose sentence is Core's own, and so may be sent back with the
 * code. A code and a path say where a plan was refused and never why, so a model
 * that cannot see the sentence can only rewrite the same plan: measured on
 * `run-mug2cjui-500e997c`, thirteen of twenty-eight decisions were
 * `bootstrap.invalid_subflows` and the build died having produced nothing. Two
 * earlier tasks improved these messages and neither changed a run, because the
 * message stopped here.
 *
 * Only Core's own authored sentences are listed. A **validator's** message is
 * still withheld -- it can quote the value it refused, and a value can hold a
 * secret, which is the guarantee `never carries a validator's message` exists to
 * keep. Adding a code here is a promise that its message quotes nothing.
 */
const AUTHORED_CODES: ReadonlySet<string> = new Set([
  // Why the Flow could not answer the instruction (`../answerability/`). Its
  // sentence is fixed and quotes nothing; the person's own words travel beside
  // the issues, in the feedback the completion check builds.
  "bootstrap.cannot_answer_instruction",
  // Why no run of the Flow could take its first step (`../reachability/`). Its
  // sentence is fixed and quotes nothing; where the Flow starts travels beside
  // the issues, in the feedback the completion check builds.
  "bootstrap.cannot_reach_start_location",
  // Which lasting act no step does (`../instructed-acts/`), and which limit a
  // completed result exceeded (`./profile-limits.ts`). Both sentences are
  // fixed and quote nothing; the acts, the person's words and the limits travel
  // beside the issues in the feedback the completion check builds.
  "bootstrap.instructed_act_missing",
  "bootstrap.completion_profile_limit_exceeded",
  // An act only a step the Flow may skip does (`../instructed-acts/optional-only.ts`).
  // Its sentence is fixed and quotes nothing; the acts travel beside the issues,
  // as the missing act's do.
  "bootstrap.instructed_act_only_optional",
  // A plan over the Flow's size (`./size-limits.ts`): each sentence is Core's
  // own, carrying only counts and the setting's name and value, so the model
  // knows the bound it must write within.
  "bootstrap.invalid_nodes",
  "bootstrap.invalid_edges",
  "bootstrap.too_many_nodes",
  "bootstrap.too_many_edges",
  "bootstrap.plan_too_large",
  "bootstrap.graph_too_deep",
  "bootstrap.invalid_subflows",
  "bootstrap.subflow_has_no_nodes",
  "bootstrap.invalid_node",
  "bootstrap.missing_output_action",
  "bootstrap.definition_unavailable",
  "bootstrap.invalid_consequences",
  "flow_draft.no_steps",
  "flow_draft.routing_unavailable",
  "flow_draft.step_not_written",
  "flow_script.no_steps",
  "flow_script.too_many_lines",
  "flow_script.duplicate_label",
  "flow_script.unknown_block",
  "flow_script.unknown_node",
  "flow_script.branch_to_next_step",
  "flow_script.invalid_condition",
  "flow_script.route_condition_missing",
  "flow_script.subflow_unreachable",
  // Handler scope binding (`../script-statements/handler-blocks.ts`,
  // `../authoring/assemble.ts`): Core's own explanation quotes only the
  // scope/step labels the model wrote, never provider or page messages.
  "flow_script.handler_invalid",
  // The repeat forms (`../authoring/draft-routing.ts`): each sentence is Core's
  // own and names only the labels, lines, node ids and pass counts the model
  // wrote, as the script codes above do.
  "flow_script.repeat_unavailable",
  "flow_script.repeat_invalid",
  "flow_script.repeat_span_unknown",
  "flow_script.repeat_body_is_routed",
  "flow_script.repeat_body_branches",
  "flow_script.branch_into_repeat",
  "flow_script.repeat_while_never_ends",
  "flow_script.repeat_not_after_its_source",
  // A `repeat most:` or `repeat pace:` no span can take, or a pace that is not
  // a time (`../script-statements/`): each sentence names only the
  // lines the model wrote, and the pace's own value cut to 40 characters.
  "flow_script.repeat_most_misplaced",
  "flow_script.repeat_pace_misplaced",
  "flow_script.repeat_pace_invalid",
  // **Every script refusal a builder can meet has its words (t608).** Everything-store
  // `run-mv8p0p7c` (0153) was refused `flow_script.part_interface_invalid` with a
  // code, a line and no sentence, resent the same script three times, and the
  // repeat guard ended its brief. Each sentence below is Core's own
  // (`../authoring/`, `../script-statements/`): it names the lines, labels,
  // inputs, outputs, ports and node ids the model itself wrote (a free-text
  // quote cut to 40-64 characters), never a validator's or a provider's
  // message, and says what to write instead. A
  // `way_out_accepts` sentence also quotes the control's words the model was
  // shown and pressed. `./tests/issue-feedback-words.test.ts` reads every
  // `flow_script.*` code the source raises and fails on one missing here.
  "flow_script.part_interface_invalid",
  "flow_script.call_unavailable",
  "flow_script.call_situation",
  "flow_script.call_misplaced",
  "flow_script.call_unknown_input",
  "flow_script.call_input_missing",
  "flow_script.call_cycle",
  "flow_script.invalid_binding",
  "flow_script.unknown_port",
  "flow_script.unknown_label",
  "flow_script.branch_across_blocks",
  "flow_script.when_outside_block",
  "flow_script.checkpoint_invalid",
  "flow_script.entry_invalid",
  "flow_script.fact_invalid",
  "flow_script.handler_unavailable",
  "flow_script.handler_then_invalid",
  "flow_script.handler_check_missing",
  "flow_script.way_out_accepts",
  // Warnings, never a refusal; their fixed sentences say what was left out.
  "flow_script.unrecognized_line",
  "flow_script.run_subflow_ignored",
  // A subflow builder's submission refused for leaving its brief
  // (`../subflow-candidate/scoped-submission.ts`, `callable-target.ts`,
  // `route-outputs.ts`). The scope refusal sends each with its own sentence;
  // they are listed so that no path that feeds them back here drops it. Each
  // names only the brief's subflow key, the part, input and output names and
  // lines the model wrote, the plan's success check and Core's act classes.
  "subflow.when_refused",
  "subflow.script_required",
  "subflow.router_rule_refused",
  "subflow.target_missing",
  "subflow.foreign_subflow_refused",
  "subflow.part_key_collision",
  "subflow.interface_changed",
  "subflow.success_check_changed",
  "subflow.lasting_act_missing",
  "subflow.lasting_act_dropped",
  "subflow.steps_outside_part",
  "subflow.target_part_missing",
  "subflow.interface_input_mismatch",
  "subflow.interface_output_mismatch",
  "subflow.output_unbound",
  "subflow.input_unread",
  "subflow.output_not_a_value",
  // An optional step, or a step that runs only after one, where it cannot
  // stand (`../script-statements/guarded-steps.ts`): each sentence is
  // Core's own and names only lines, labels and node ids the model wrote, and
  // says what to write instead.
  "flow_script.optional_invalid",
  "flow_script.optional_misplaced",
  "flow_script.optional_unavailable",
  "flow_script.only_after_misplaced",
  // A fact the model wrote that names its element by anything but a handle
  // (`../../llm/harness-options/plan-parameter-resolution.ts`, t432): a fixed
  // sentence that quotes nothing and says to name it by its handle.
  "bootstrap.target_not_a_handle",
  // A handle nothing resolved (`../../llm/harness-options/plan-parameter-resolution.ts`,
  // t514): Core's sentence names only the parameter holding it and the token
  // the model wrote there, each an identifier.
  "bootstrap.handle_unresolved",
  // A record output's processing naming a field it does not keep
  // (`./record-output-contract.ts`, t489): Core's sentence names only the field
  // ids the model wrote in that record output and the ids its schema stores,
  // never a value a condition compares.
  "record_output.process_unknown_field",
  "record_output.process_excluded_field",
  "record_output.process_where_column_dropped"
]);

const ROUTE_CODES: ReadonlySet<string> = new Set([
  "flow_script.invalid_condition",
  "flow_script.route_condition_missing",
  "flow_script.subflow_unreachable",
  "flow_script.when_outside_block",
  "flow_script.branch_to_next_step",
  "bootstrap.route_condition_missing",
  "bootstrap.route_condition_invalid",
  "bootstrap.route_condition_path",
  "bootstrap.route_condition_operator",
  "bootstrap.route_condition_value",
  "bootstrap.route_shadowed",
  "bootstrap.subflow_unreachable"
]);

/** Issue codes about a handle a node's parameter names (`web.handle.unknown`, `web.handle.stale:target`, ...). */
const HANDLE_ISSUE = /^[a-z]+\.handle\.[a-z_]+(?::|$)/u;
/** The keys a written handle reference carries (`../../llm/harness-options/plan-node-handles.ts`). */
const HANDLE_KEY = "handle", LOCATION_KEY = "location";

const PARAMETER_PATH = /^plan\.subflows\.(\d+)\.nodes\.(\d+)\.parameters\.([^.]+)/u;
/**
 * A domain refuses a node's parameters as a whole, at this path, and says
 * where inside them in its code: `<reason>:<parameter id>.<position>`.
 */
const PARAMETERS_PATH = /^plan\.subflows\.(\d+)\.nodes\.(\d+)\.parameters$/u;
const POSITIONED_PARAMETER = /^[^:]+:([^.:]+)/u;

/** A field or name a refusal's detail may carry: identifier characters only, never a sentence or a page value. */
const DETAIL_NAME = /^[A-Za-z0-9_.:-]{1,200}$/u;

/**
 * Core's sentence for a domain refusal that named the field it could not use
 * and the names it can use (t489, lane D round 13). Only the code and those
 * identifiers are inserted; the domain's own words never are.
 */
export function automationStudioFlowBootstrapIssueDetailSentence(code: string, detail: AutomationStudioFlowBootstrapIssueDetail): string {
  const field = detail.field !== undefined ? `It names ${JSON.stringify(detail.field)}, which the step cannot use there.` : "It names something the step cannot use there.";
  const valid = detail.valid?.length ? ` The names it can use there are ${detail.valid.map((name) => JSON.stringify(name)).join(", ")}: write one of those instead.` : "";
  return `The domain that runs this step refused it (${code}). ${field}${valid}`;
}

/** The detail as the model may read it: each name an identifier, the rest dropped; nothing when no name is left. */
function detailOf(detail: AutomationStudioFlowBootstrapIssueDetail | undefined): AutomationStudioFlowBootstrapIssueDetail | undefined {
  if (!detail) return undefined;
  const field = typeof detail.field === "string" && DETAIL_NAME.test(detail.field) ? detail.field : undefined;
  const valid = Array.isArray(detail.valid) ? [...new Set(detail.valid.filter((name) => typeof name === "string" && DETAIL_NAME.test(name)))] : [];
  return field !== undefined || valid.length ? { ...(field !== undefined ? { field } : {}), ...(valid.length ? { valid } : {}) } : undefined;
}

/** The issues a refused plan is fed back with, each with the shape it accepts where one applies. */
export function automationStudioFlowBootstrapIssueFeedback(input: {
  issues: readonly AutomationStudioFlowBootstrapIssue[];
  /** The plan the issues are about, as the model wrote it. */
  plan?: unknown;
  registry?: AutomationStudioNodeRegistry | undefined;
  resolution?: AutomationStudioNodeRegistryResolution | undefined;
}): JsonObject[] {
  const described = new Set<string>();
  const instructed = new Set<string>();
  return input.issues.map((issue) => {
    const detail = detailOf(issue.detail);
    const entry: JsonObject = {
      code: issue.code,
      ...(issue.path ? { path: printablePath(issue.path) } : {}),
      // Core's own sentence is kept, with any detail beside it (t510); a domain's refusal that named a
      // field is said in Core's sentence, rebuilt here from the detail alone (t489).
      ...(AUTHORED_CODES.has(issue.code) && issue.message ? { message: issue.message, ...(detail ?? {}) }
        : detail ? { message: automationStudioFlowBootstrapIssueDetailSentence(issue.code, detail), ...detail } : {})
    };
    const target = issue.path ? parameterTarget(issue.path, issue.code) : undefined;
    const definition = target ? definitionAt(input, target) : undefined;
    const instead = insteadOf(issue, input.plan, instructed) ?? wordInstead(issue, input.plan, target, definition);
    if (instead) entry.instead = instead;
    // The node to ask `core.describe_nodes` about, for an issue about one of its parameters (header, t514).
    if (definition && NODE_NAMED_CODES.has(issue.code)) entry.node = definition.id;
    // Core's own sentence for a parameter the node does not take, on every such issue (t606).
    if (issue.code === UNKNOWN_PARAMETER_CODE && entry.message === undefined) entry.message = undeclaredSentence(target, definition);
    if (ROUTE_CODES.has(issue.code)) {
      return { ...entry, accepted: { condition: AUTOMATION_STUDIO_ROUTE_CONDITION_FORM } };
    }
    const handles = issue.path && HANDLE_ISSUE.test(issue.code) ? handlesAt(input.plan, issue.path, issue.code) : [];
    if (handles.length) entry.handles = handles;
    if (!target || described.has(target.key)) return entry;
    const accepted = definition ? acceptedShape(definition, target) : undefined;
    if (!accepted) return entry;
    described.add(target.key);
    return { ...entry, accepted };
  });
}

/** The issues about one of a node's parameters that name the node, for `core.describe_nodes` (header, t514). */
const NODE_NAMED_CODES: ReadonlySet<string> = new Set(["bootstrap.unknown_parameter", "bootstrap.invalid_parameter_value", "bootstrap.handle_unresolved"]);
const UNRESOLVED_CODE = "bootstrap.handle_unresolved";
const UNKNOWN_PARAMETER_CODE = "bootstrap.unknown_parameter";

/**
 * Core's sentence for a parameter a step's node does not take (t606): the
 * parameter as the model wrote its key, the node, and every parameter the node
 * takes that the model writes. Only identifiers are inserted -- the key from
 * the issue's path, the node's id and its parameters' ids -- never a value.
 * A8 towels (`run-mv8p37k8-f1a90624`) sent one script four times after its
 * `bootstrap.unknown_parameter` issues came back with no sentence, and only
 * the first with the node's parameters.
 */
function undeclaredSentence(target: ParameterTarget | undefined, definition: AutomationStudioNodeDefinition | undefined): string {
  const key = target && DETAIL_NAME.test(target.parameterId) ? JSON.stringify(target.parameterId) : "this parameter";
  if (!definition) return `The step's node takes no parameter ${key}. Ask core.describe_nodes for the parameters it takes and write one of those, or move the line to the step whose node takes it.`;
  const shown = definition.parameters.filter((parameter) => parameter.shownToModel !== false).map((parameter) => JSON.stringify(parameter.id));
  const takes = shown.length ? `The parameters it takes are ${shown.join(", ")}` : "It takes no parameter you write";
  return `The node ${definition.id} takes no parameter ${key}. ${takes}: write the line under one of those, or move it to a step whose node takes it.`;
}

/**
 * What to write instead of a word under the wrong key (header, t514): the
 * issue's own sentence, where the check that raised it wrote one, or, for a
 * handle nothing resolved, the line the node takes that token in as a word.
 */
function wordInstead(issue: AutomationStudioFlowBootstrapIssue, plan: unknown, target: ParameterTarget | undefined, definition: AutomationStudioNodeDefinition | undefined): string | undefined {
  if (typeof issue.instead === "string" && issue.instead) return issue.instead;
  if (issue.code !== UNRESOLVED_CODE || !issue.path || !target || target.undeclared || !definition) return undefined;
  const word = handlesAt(plan, issue.path, issue.code)[0]?.handle;
  return typeof word === "string" ? automationStudioFlowBootstrapWordInstead({ key: target.parameterId, word, definition, as: "unresolved_handle" }).instead : undefined;
}

/** Codes saying a step's consequences are undeclared, from any domain (`web.step.consequences_undeclared`, `web.step.expected.consequences_classes_or_none`). */
const CONSEQUENCES_UNDECLARED = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*\.(?:consequences_undeclared|expected\.consequences_classes_or_none)$/u;
const NODE_PATH = /^plan\.subflows\.(\d+)\.nodes\.(\d+)(?:\.|$)/u;
const CLASSES = AUTOMATION_STUDIO_ACTION_CONSEQUENCES.join(", ");
/** What a step that sends its form, or one that presses, writes instead. Fixed sentences; the classes are Core's own. */
const SENDS_INSTEAD = `This step sends its form (submit: true), which is a press, and does not say what that does. Add \`consequences: none\` to it when the press only searches, filters or navigates; otherwise add \`consequences: <classes>\`, naming those of ${CLASSES} it causes.`;
const PRESSES_INSTEAD = `This step presses something and does not say what that does. Add \`consequences: none\` to it when the press only reveals, searches, filters or navigates; otherwise add \`consequences: <classes>\`, naming those of ${CLASSES} it causes.`;

/**
 * What to write instead, for an issue Core knows the answer to; once per step,
 * so the two codes a domain refuses one step with carry one sentence.
 */
function insteadOf(issue: AutomationStudioFlowBootstrapIssue, plan: unknown, instructed: Set<string>): string | undefined {
  if (!CONSEQUENCES_UNDECLARED.test(issue.code)) return undefined;
  const at = issue.path ? NODE_PATH.exec(issue.path) : null;
  const key = at ? `${at[1]}.${at[2]}` : issue.path ?? "";
  if (instructed.has(key)) return undefined;
  instructed.add(key);
  const parameters = at ? nodeAt(plan, Number(at[1]), Number(at[2]))?.parameters : undefined;
  return isRecord(parameters) && parameters.submit === true ? SENDS_INSTEAD : PRESSES_INSTEAD;
}

type ParameterTarget = {
  subflowIndex: number;
  nodeIndex: number;
  parameterId: string;
  /** A parameter not declared is answered with the node's parameters, once per node. */
  undeclared: boolean;
  key: string;
};

function parameterTarget(path: string, code: string): ParameterTarget | undefined {
  const named = PARAMETER_PATH.exec(path);
  const whole = named ? undefined : PARAMETERS_PATH.exec(path);
  const positioned = whole ? POSITIONED_PARAMETER.exec(code) : undefined;
  const match = named ?? (whole && positioned ? [whole[0], whole[1], whole[2], positioned[1]] : undefined);
  if (!match) return undefined;
  const [, subflow, node, parameterId] = match;
  const undeclared = code === "bootstrap.unknown_parameter";
  return {
    subflowIndex: Number(subflow),
    nodeIndex: Number(node),
    parameterId: parameterId!,
    undeclared,
    key: `${subflow}.${node}${undeclared ? "#parameters" : `.${parameterId}`}`
  };
}

/**
 * The handles the refused parameter holds, as the model wrote them: under the
 * parameter the path or the code names, or, for an issue placed on the
 * parameters as a whole with no parameter in its code, under all of them.
 */
function handlesAt(plan: unknown, path: string, code: string): JsonObject[] {
  const named = PARAMETER_PATH.exec(path);
  const whole = named ? undefined : PARAMETERS_PATH.exec(path);
  const at = named ?? whole;
  if (!at) return [];
  const parameters = nodeAt(plan, Number(at[1]), Number(at[2]))?.parameters;
  if (!isRecord(parameters)) return [];
  // A named parameter, or the one the code positions; otherwise every parameter of the node.
  const parameterId = named ? named[3] : POSITIONED_PARAMETER.exec(code)?.[1];
  const found: JsonObject[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!isRecord(value)) return;
    const handle = value[HANDLE_KEY];
    if (typeof handle === "string" && handle.trim() !== "") {
      const location = typeof value[LOCATION_KEY] === "string" ? value[LOCATION_KEY] : undefined;
      const key = `${handle}\u0000${location ?? ""}`;
      if (!seen.has(key)) { seen.add(key); found.push(location === undefined ? { handle } : { handle, location }); }
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  visit(parameterId === undefined ? parameters : parameters[parameterId]);
  return found;
}

function nodeAt(plan: unknown, subflowIndex: number, nodeIndex: number): Record<string, unknown> | undefined {
  if (!isRecord(plan) || !Array.isArray(plan.subflows)) return undefined;
  const subflow: unknown = plan.subflows[subflowIndex];
  if (!isRecord(subflow) || !Array.isArray(subflow.nodes)) return undefined;
  const node: unknown = subflow.nodes[nodeIndex];
  return isRecord(node) ? node : undefined;
}

function definitionAt(
  input: { plan?: unknown; registry?: AutomationStudioNodeRegistry | undefined; resolution?: AutomationStudioNodeRegistryResolution | undefined },
  target: ParameterTarget
): AutomationStudioNodeDefinition | undefined {
  if (!input.registry || !input.resolution || !isRecord(input.plan) || !Array.isArray(input.plan.subflows)) return undefined;
  const subflow: unknown = input.plan.subflows[target.subflowIndex];
  if (!isRecord(subflow) || !Array.isArray(subflow.nodes)) return undefined;
  const node: unknown = subflow.nodes[target.nodeIndex];
  if (!isRecord(node) || typeof node.definitionId !== "string") return undefined;
  return input.registry.get(node.definitionId, input.resolution);
}

/**
 * The shape a refused parameter accepts, from the catalog's own text. A
 * parameter the host fills from what the model names (`shownToModel: false`)
 * has no shape to give: the model never writes it, and showing it would teach
 * it to (t432). Its refusal's own codes say where the handle goes instead.
 */
function acceptedShape(definition: AutomationStudioNodeDefinition, target: ParameterTarget): JsonObject | undefined {
  const shown = definition.parameters.filter((parameter) => parameter.shownToModel !== false);
  if (target.undeclared) return { parameters: shown.map((parameter) => parameter.id) };
  const parameter = shown.find((candidate) => candidate.id === target.parameterId);
  if (!parameter) return undefined;
  if (parameter.ui?.control === "record-output") {
    const contract = automationStudioFlowBootstrapRecordOutputContract(definition);
    return { parameter: parameter.id, keys: contract.keys, requiredKeys: contract.requiredKeys, shape: contract.text, example: contract.example };
  }
  const { id, ...shape } = automationStudioFlowBootstrapParameterText(definition, parameter);
  return { parameter: id, ...shape } as JsonObject;
}

/** A plan path is the plan's own structure; still, it is printable. */
function printablePath(path: string): string {
  return path.replace(/[ -]/gu, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
