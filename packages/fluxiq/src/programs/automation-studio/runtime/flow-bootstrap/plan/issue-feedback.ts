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
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "./contracts.ts";
import { automationStudioFlowBootstrapParameterText } from "./parameter-text.ts";
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
  // An optional step, or a step that runs only after one, where it cannot
  // stand (`../script-statements/guarded-steps.ts`): each sentence is
  // Core's own and names only lines, labels and node ids the model wrote, and
  // says what to write instead.
  "flow_script.optional_invalid",
  "flow_script.optional_misplaced",
  "flow_script.optional_unavailable",
  "flow_script.only_after_misplaced"
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
    const entry: JsonObject = {
      code: issue.code,
      ...(issue.path ? { path: printablePath(issue.path) } : {}),
      ...(AUTHORED_CODES.has(issue.code) && issue.message ? { message: issue.message } : {})
    };
    const instead = insteadOf(issue, input.plan, instructed);
    if (instead) entry.instead = instead;
    if (ROUTE_CODES.has(issue.code)) {
      return { ...entry, accepted: { condition: AUTOMATION_STUDIO_ROUTE_CONDITION_FORM } };
    }
    const target = issue.path ? parameterTarget(issue.path, issue.code) : undefined;
    const handles = issue.path && HANDLE_ISSUE.test(issue.code) ? handlesAt(input.plan, issue.path, issue.code) : [];
    if (handles.length) entry.handles = handles;
    if (!target || described.has(target.key)) return entry;
    const definition = definitionAt(input, target);
    const accepted = definition ? acceptedShape(definition, target) : undefined;
    if (!accepted) return entry;
    described.add(target.key);
    return { ...entry, accepted };
  });
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

function acceptedShape(definition: AutomationStudioNodeDefinition, target: ParameterTarget): JsonObject | undefined {
  if (target.undeclared) return { parameters: definition.parameters.map((parameter) => parameter.id) };
  const parameter = definition.parameters.find((candidate) => candidate.id === target.parameterId);
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
