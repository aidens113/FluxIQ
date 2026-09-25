// Resolving the parameter names a plan wrote against the names its nodes
// declare, before anything is validated.
//
// `validation.ts` used to answer a key it did not recognise with
// `bootstrap.unknown_parameter` and nothing else, so a one-character slip in a
// parameter name refused the whole build -- a paid provider call spent, and
// the model told only that a key it believed in was unknown. A name that is
// plainly the same name is not an unknown name, and the standing instruction
// is that an unknown name falls back to a closest-match search and is resolved
// automatically, for every kind of name there is.
//
// **The correction rewrites the plan, not the verdict.** A validator that
// merely stopped complaining would hand execution the key the model wrote, and
// the node would run with the parameter missing -- a worse failure than the
// refusal, because nothing says it happened. So the pass returns a plan whose
// parameter keys are the declared ones, and validation, risk, layout and
// everything downstream read that plan.
//
// **What it is not.** It is not a second matcher: the scoring, the normalising
// and the floor all live in `nodes/name-match/`, and this module decides only
// which candidates to offer and what shape the written value is. It is also
// not the authoring path's key matching (`../authoring/matching.ts`), which
// resolves a Flow script's keys against ids, labels and synonyms before a plan
// exists. That runs first and catches what it can name exactly; this is the
// backstop underneath it, and the only correction a plan that arrived as JSON
// ever gets.
//
// **A key with no plausible candidate is still refused.** The pass leaves it
// exactly as written, so `bootstrap.unknown_parameter` is raised by there being
// no plausible answer, never by a near miss.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioMatchName,
  isAutomationNodeParameterStateBinding,
  type AutomationNodeParameter,
  type AutomationStudioNameCandidate,
  type AutomationStudioNameValueShape,
  type AutomationStudioNodeDefinition,
  type AutomationStudioNodeRegistry,
  type AutomationStudioNodeRegistryResolution
} from "../../../nodes/index.ts";
import type {
  AutomationStudioFlowBootstrapNode,
  AutomationStudioFlowBootstrapPlan,
  AutomationStudioFlowBootstrapSubflow
} from "./contracts.ts";
import type { AutomationStudioFlowBootstrapNameAssumption } from "./name-correction-assumption.ts";

/**
 * The plan with every parameter key resolved to a name its node declares, and
 * one assumption for each name that was resolved rather than written.
 *
 * A plan whose names were all written correctly comes back as the same object:
 * nothing is copied, and `assumptions` is empty.
 */
export function correctAutomationStudioFlowBootstrapPlanNames(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): { plan: AutomationStudioFlowBootstrapPlan; assumptions: AutomationStudioFlowBootstrapNameAssumption[] } {
  const assumptions: AutomationStudioFlowBootstrapNameAssumption[] = [];
  const subflows = input.plan.subflows.map((subflow) => correctSubflow(subflow, input, assumptions));
  if (!assumptions.length) return { plan: input.plan, assumptions };
  return { plan: { ...input.plan, subflows }, assumptions };
}

function correctSubflow(
  subflow: AutomationStudioFlowBootstrapSubflow,
  input: { registry: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution },
  assumptions: AutomationStudioFlowBootstrapNameAssumption[]
): AutomationStudioFlowBootstrapSubflow {
  let corrected = false;
  const nodes = subflow.nodes.map((node) => {
    const result = correctNode(subflow.key, node, input, assumptions);
    if (result !== node) corrected = true;
    return result;
  });
  return corrected ? { ...subflow, nodes } : subflow;
}

/**
 * One node's parameter keys.
 *
 * A candidate already claimed -- by a key written correctly, or by an earlier
 * correction on this node -- is withdrawn from the next match, so a near miss
 * can never take the place of a parameter that was written properly, and two
 * misses cannot land on one name and lose a value between them.
 */
function correctNode(
  subflowKey: string,
  node: AutomationStudioFlowBootstrapNode,
  input: { registry: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution },
  assumptions: AutomationStudioFlowBootstrapNameAssumption[]
): AutomationStudioFlowBootstrapNode {
  const written = node.parameters;
  if (!written) return node;
  const definition = input.registry.get(node.definitionId, input.resolution);
  if (!definition) return node;
  const declared = new Set(definition.parameters.map((parameter) => parameter.id));
  const keys = Object.keys(written);
  if (keys.every((key) => declared.has(key))) return node;

  const claimed = new Set(keys.filter((key) => declared.has(key)));
  const corrected: JsonObject = {};
  const found: AutomationStudioFlowBootstrapNameAssumption[] = [];
  // Entries rather than keys: every key the model wrote reaches the corrected
  // object, under its own name or the resolved one, so a correction never
  // drops a value on its way to the node.
  for (const [key, value] of Object.entries(written)) {
    if (declared.has(key)) {
      corrected[key] = value;
      continue;
    }
    const valueShape = writtenValueShape(value);
    const match = automationStudioMatchName(key, unclaimedCandidates(definition, claimed), { valueShape });
    // `exact` cannot happen -- every candidate is a declared id and this key is
    // not one -- and a key left as written is refused, which is the honest
    // answer if it ever did.
    if (!match || match.how === "exact") {
      corrected[key] = value;
      continue;
    }
    claimed.add(match.id);
    corrected[match.id] = value;
    found.push({
      kind: "parameter_name",
      how: match.how,
      score: match.score,
      subflowKey,
      nodeKey: node.key,
      definitionId: definition.id,
      parameterId: match.id,
      ...(isIdentifierShaped(key) ? { writtenName: key } : {}),
      valueShape
    });
  }
  if (!found.length) return node;
  assumptions.push(...found);
  return { ...node, parameters: corrected };
}

/**
 * One written key resolved against what a node declares, for a caller that
 * reads the model's keys before a plan exists.
 *
 * The authoring reader (`../authoring/normalise.ts`) turns the model's written
 * keys into a node's parameters, and refuses a key it does not recognise
 * *before* any plan is built -- so the correction this module performs on a
 * plan never ran on the live creation path at all. Published here rather than
 * copied there so one file decides what a parameter accepts and what a written
 * value is, and the two readers can never drift apart on it.
 */
export function automationStudioMatchWrittenParameterName(
  key: string,
  value: JsonValue,
  definition: AutomationStudioNodeDefinition,
  claimed: ReadonlySet<string>
): { id: string; how: "normalized" | "nearest"; score: number; valueShape: AutomationStudioNameValueShape } | undefined {
  const valueShape = writtenValueShape(value);
  const match = automationStudioMatchName(key, unclaimedCandidates(definition, claimed), { valueShape });
  // `exact` cannot happen: every candidate is a declared id and a caller only
  // asks about a key that is not one.
  if (!match || match.how === "exact") return undefined;
  return { id: match.id, how: match.how, score: match.score, valueShape };
}

/** The declared parameters nothing has claimed yet, with what each one takes. */
function unclaimedCandidates(definition: AutomationStudioNodeDefinition, claimed: ReadonlySet<string>): AutomationStudioNameCandidate[] {
  return definition.parameters
    .filter((parameter) => !claimed.has(parameter.id))
    .map((parameter) => ({ id: parameter.id, accepts: acceptedValueShape(parameter) }));
}

/**
 * What a declared parameter takes, in the matcher's coarse vocabulary.
 *
 * This is the half of the pairing the registry knows. Paired with the shape of
 * the value the model actually wrote, it is what settles the case the standing
 * instruction names: two similarly spelled parameters, one of them a list, and
 * a list written under the name -- that is the one, assumed without asking.
 */
function acceptedValueShape(parameter: AutomationNodeParameter): AutomationStudioNameValueShape {
  return ACCEPTED_VALUE_SHAPES[parameter.valueType];
}

/**
 * `expression` is text because that is what is written in the slot, whatever it
 * evaluates to later. `signal`, `policy`, `routine` and `any` are `unknown`
 * rather than `record`: a declaration that says nothing about the shape must
 * not read as a claim about it, because the matcher treats a shape it is given
 * as evidence.
 */
const ACCEPTED_VALUE_SHAPES: Record<AutomationNodeParameter["valueType"], AutomationStudioNameValueShape> = {
  boolean: "boolean",
  number: "number",
  string: "text",
  expression: "text",
  array: "list",
  object: "record",
  json: "record",
  signal: "unknown",
  policy: "unknown",
  routine: "unknown",
  any: "unknown"
};

/**
 * The shape of the value written under a name.
 *
 * `null` says nothing -- it is how a record output saves nothing -- and a state
 * binding is whatever the run resolves it to, so neither is reported as a
 * shape. Reporting a binding as a `record` would be a claim about an object
 * that never reaches the node.
 */
function writtenValueShape(value: JsonValue): AutomationStudioNameValueShape {
  if (value === null) return "unknown";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "text";
  if (Array.isArray(value)) return "list";
  return isAutomationNodeParameterStateBinding(value) ? "unknown" : "record";
}

/**
 * Whether a written key is plain enough to publish beside the correction. The
 * parser bounds a plan's size but not its parameter keys, and an assumption
 * travels in a run's record, so anything that is not an identifier is left out
 * rather than carried.
 */
const IDENTIFIER_SHAPED = /^[A-Za-z0-9_.:-]{1,64}$/;

function isIdentifierShaped(key: string): boolean {
  return IDENTIFIER_SHAPED.test(key);
}
