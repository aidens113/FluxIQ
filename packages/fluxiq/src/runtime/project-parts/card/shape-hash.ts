// A hash of a part's steps' shape, which stops a duplicate at save.
//
// What goes in: each step's kind and parameters in the order a run reaches them,
// with the control it acts on as its fingerprint's identifying signals, an input
// binding as the path it reads, a call as the shape of the part it calls, and the
// edges between steps by position. What stays out: node ids, labels, edge ids,
// positions and metadata other than the declared consequences, so a copy saved
// under other ids and names hashes the same. A literal a step types or chooses is
// masked, so the same part with another fixed value hashes the same too: the
// value is shown on the card, which is where a person tells the two apart. The
// hash is a digest, so it may hold what is not for a card.
import { createHash } from "node:crypto";
import type { JsonValue } from "../../../core/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../components/automation/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "../../../engine/automation/defensive/index.ts";
import { canonicalPartJson } from "./canonical-json.ts";
import { partCalleeOf } from "./calls.ts";
import { PART_VALUE_KEYS } from "./parameter-keys.ts";
import { partOriginOf, partStepNavigates } from "./origins.ts";
import type { AutomationStudioPartStep } from "./steps.ts";
import type { AutomationStudioPartCallee, AutomationStudioPartGraph } from "./types.ts";

/** The target fields that are run evidence, not identity: where the control was, what else was a candidate, how it was found. */
const EVIDENCE_ONLY: ReadonlySet<string> = new Set(["bounds", "candidates", "selectedCandidate", "source", "metadata"]);
const MASKED = "*";

export function partShapeHashOf(input: {
  graph: Pick<AutomationStudioPartGraph, "interface" | "edges">;
  steps: readonly AutomationStudioPartStep[];
  callees: Readonly<Record<string, AutomationStudioPartCallee>>;
  controlKeys: ReadonlySet<string>;
}): string {
  const position = new Map(input.steps.map((step, index) => [step.node.id, index]));
  const edges = input.graph.edges
    .filter((edge) => position.has(edge.sourceNodeId) && position.has(edge.targetNodeId))
    .map((edge) => [position.get(edge.sourceNodeId), edge.sourcePortId ?? "", position.get(edge.targetNodeId), edge.targetPortId ?? ""])
    .sort((left, right) => canonicalPartJson(left).localeCompare(canonicalPartJson(right)));
  const ports = (list: AutomationStudioPartGraph["interface"]["inputs"]) => list.map((port) => [port.id, port.required === true]).sort();
  const shape = {
    inputs: ports(input.graph.interface.inputs),
    outputs: ports(input.graph.interface.outputs),
    steps: input.steps.map((step) => stepShape(step, input.callees, input.controlKeys)),
    edges
  };
  return createHash("sha256").update(canonicalPartJson(shape)).digest("hex");
}

function stepShape(step: AutomationStudioPartStep, callees: Readonly<Record<string, AutomationStudioPartCallee>>, controlKeys: ReadonlySet<string>): JsonValue {
  const declared = step.node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  const consequences = Array.isArray(declared) ? declared.filter((item): item is string => typeof item === "string").sort() : null;
  if (step.isCall) return { kind: step.kind, call: partCalleeOf(step, callees)?.shapeHash ?? null, consequences, inputs: mask(step.params.inputs, "inputs", step, controlKeys) };
  const params: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(step.params)) params[key] = mask(value, key, step, controlKeys);
  return { kind: step.kind, params, consequences };
}

function mask(value: JsonValue | undefined, key: string, step: AutomationStudioPartStep, controlKeys: ReadonlySet<string>): JsonValue {
  if (value === undefined) return null;
  if (isAutomationNodeParameterStateBinding(value)) return { bind: value.$state.path.replace(/^\$node\.[^.]+/u, "$node.*") };
  if (controlKeys.has(key)) return targetShape(value);
  if (PART_VALUE_KEYS.has(key)) return Array.isArray(value) ? value.map(() => MASKED) : typeof value === "object" && value !== null ? mask(value, "", step, controlKeys) : MASKED;
  if (key === "url" && partStepNavigates(step)) return partOriginOf(value) ?? MASKED;
  if (Array.isArray(value)) return value.map((item) => mask(item, "", step, controlKeys));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, mask(item, name, step, controlKeys)]));
  return value;
}

function targetShape(target: JsonValue): JsonValue {
  if (!target || typeof target !== "object" || Array.isArray(target)) return target;
  // The domain's identity of a control is carried whole; only what a run saw of it is left out.
  const fingerprint = target.fingerprint && typeof target.fingerprint === "object" && !Array.isArray(target.fingerprint) ? target.fingerprint : target;
  const stable: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(fingerprint)) if (!EVIDENCE_ONLY.has(key)) stable[key] = item;
  return { target: stable };
}
