// Which arrangements of a written plan express the same subflows, and what a
// plan that expresses none is told.
//
// A plan used to be readable only as `{subflows: [...]}`, one subflow object,
// or a node list at the plan's top level. Anything else came back as "Bootstrap
// subflows must be an array" -- a sentence that names nothing the model can
// change, because a model that wrote `{"subflows": {"main": {...}}}` has
// written an object and a model that wrote a bare list of steps has written an
// array. Measured on 2026-09-24, the live run `run-mug2cjui-500e997c`
// (`social-network-feed-confirm-requests`) spent 13 of its 28 decisions on that
// one refusal: it wrote a plan, was refused, rewrote it, and was refused again,
// thirteen times, for 27 provider calls and no Flow. Earlier runs on other
// sites repeated it 15, 16 and 24 times.
//
// The wrapper is not what a plan means, so it is derived here rather than
// demanded of the model. `readAuthoringPlanSubflows` reads, and names as one
// subflow each:
//
//   - `subflows` as an array of subflow objects -- what it always read;
//   - `subflows` as an object keyed by subflow name or id, the key becoming
//     that subflow's key where the subflow wrote none;
//   - a single subflow object where a list of one was expected;
//   - `subflows` holding a bare list of nodes, or a single node, with no
//     subflow wrapper around them -- the shape a straight-line Flow has;
//   - `subflows` as an array of node lists, one array per subflow;
//   - a node list at the plan's top level, or one level down under a key like
//     `plan`, `flow` or `graph`, the plan itself being the wrapper;
//   - the plan written as the bare array of nodes.
//
// A node list is read under `nodes`, `steps` or `actions` wherever it appears,
// matched as every other key in this directory is -- through `authoringKey`, so
// two spellings of the same word are the same word.
//
// Nothing here decides what a plan *means*. It answers only where the nodes
// are; `./json-plan.ts` builds the plan from them, and every node it builds
// still has to name a definition the registry resolves in this Flow's scope.
//
// A plan that really holds no nodes is refused, and the refusal says what was
// received -- the plan's own keys, and what `subflows` turned out to be --
// beside the shapes that would be accepted, so a rewrite has somewhere to go.
// Structure and key names only: a written value may hold whatever the page
// held, so no refusal ever quotes one.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { authoringKey } from "./keys.ts";
import { isJsonObject } from "./values.ts";

/** Names a node list may be written under, and the order they are looked for in. */
const NODE_LIST_KEYS = ["nodes", "steps", "actions"];
/** Names a subflow collection may be written under, as `authoringKey` reduces them. */
const SUBFLOW_LIST_KEYS = new Set(["subflows", "subflow", "flows"]);
/** Keys a plan may have nested its whole body under, looked at first when scanning. */
const NESTED_PLAN_KEYS = new Set(["plan", "flow", "workflow", "graph", "main", "body"]);
/** Keys the nested scan never descends into: they carry a plan's trimmings, not its nodes. */
const SKIPPED_NESTED_KEYS = new Set(["router", "routing", "routes", "summary", "metadata", "meta", "nodecatalog", "evidence", "notes"]);
/** Keys whose string value names the definition a node runs, so an object holding one is a node. */
const DEFINITION_KEYS = new Set(["definitionid", "definition", "node", "nodeid", "type"]);
/** How deep the scan for a misplaced node list goes before giving up. */
const MAX_NESTED_DEPTH = 2;
/** How many of a refused plan's keys the refusal names before it counts the rest. */
const MAX_DESCRIBED_KEYS = 12;
const MAX_DESCRIBED_KEY_LENGTH = 40;

/** The shapes a plan may be written in, spelled out for a model that has to rewrite one. */
export const AUTOMATION_STUDIO_AUTHORING_PLAN_SHAPES =
  'Write {"subflows":[{"key":"main","nodes":[{"definitionId":"<id from nodeCatalog>","parameters":{}}]}]}, '
  + 'or just {"nodes":[...]} for one straight line of steps. '
  + "subflows may be an array of subflows, an object keyed by subflow name, one subflow object, or the node list itself; "
  + `a node list may be written under ${NODE_LIST_KEYS.join(", ")}.`;

/**
 * One subflow as the model wrote it, with the name the plan's own structure
 * gave it where the object itself carried none -- the key of the map it was an
 * entry of, which is the only place that name exists.
 */
export type AuthoringWrittenSubflow = { written: JsonObject; namedBy?: string };

/** The subflows a written plan holds, or why it holds none. */
export type AuthoringPlanRead =
  | { plan: JsonObject; subflows: AuthoringWrittenSubflow[] }
  | { refusal: { code: "bootstrap.invalid_plan" | "bootstrap.invalid_subflows"; message: string; path: string } };

/** Where a written plan put its nodes, in whatever wrapper it put them in. */
export function readAuthoringPlanSubflows(value: JsonValue): AuthoringPlanRead {
  const plan = planObject(value);
  if (!plan) {
    return {
      refusal: {
        code: "bootstrap.invalid_plan",
        message: `Bootstrap plan ${describeAuthoringShape(value)}; it must be an object, or the list of nodes itself. ${AUTOMATION_STUDIO_AUTHORING_PLAN_SHAPES}`,
        path: "plan"
      }
    };
  }
  const subflows = subflowList(plan, 0);
  if (subflows.length) return { plan, subflows };
  return {
    refusal: {
      code: "bootstrap.invalid_subflows",
      message: `Bootstrap plan holds no nodes: subflows ${describeAuthoringShape(valueUnder(plan, SUBFLOW_LIST_KEYS))}, and the plan ${describeAuthoringShape(plan)}. ${AUTOMATION_STUDIO_AUTHORING_PLAN_SHAPES}`,
      path: "plan.subflows"
    }
  };
}

/** The node list an object holds, under any of the names one may be written under. */
export function authoringNodeList(value: JsonObject): JsonValue[] | undefined {
  for (const name of NODE_LIST_KEYS) {
    for (const [key, item] of Object.entries(value)) {
      if (authoringKey(key) === name && Array.isArray(item)) return item;
    }
  }
  return undefined;
}

/**
 * One written value described by its structure alone, as `is <shape>`.
 *
 * Keys are named because they are the model's own writing and are what it must
 * change; values never are, because a value can hold whatever the page held.
 */
export function describeAuthoringShape(value: JsonValue | undefined): string {
  if (value === undefined) return "is absent";
  if (value === null) return "is null";
  if (Array.isArray(value)) return value.length ? `is an array of ${value.length} ${itemKind(value)}` : "is an empty array";
  if (isJsonObject(value)) {
    const keys = Object.keys(value);
    return keys.length ? `is an object with keys ${describeKeys(keys)}` : "is an empty object";
  }
  return typeof value === "string" ? "is a string" : typeof value === "number" ? "is a number" : "is a boolean";
}

/** The plan as an object, taking a bare list of nodes as the plan it stands for. */
function planObject(value: JsonValue): JsonObject | undefined {
  if (isJsonObject(value)) return value;
  return Array.isArray(value) ? { nodes: value } : undefined;
}

/**
 * The subflows a plan wrote, in whatever arrangement it wrapped them in.
 *
 * The order is deliberate. A written subflow collection wins, because a model
 * that named one meant it. A node list at this level comes next, because a plan
 * that is itself the subflow needs no wrapper. The scan one level down is last
 * and is a fallback: it accepts what it finds only when every subflow it found
 * actually holds nodes, so a `router` or a `metadata` object cannot be mistaken
 * for the Flow.
 */
function subflowList(plan: JsonObject, depth: number): AuthoringWrittenSubflow[] {
  const collection = subflowsFrom(valueUnder(plan, SUBFLOW_LIST_KEYS));
  if (collection.length) return collection;
  if (authoringNodeList(plan)) return [{ written: plan }];
  return nestedSubflows(plan, depth);
}

/** One written `subflows` value read as the subflows it stands for. */
function subflowsFrom(value: JsonValue | undefined): AuthoringWrittenSubflow[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return subflowsFromArray(value);
  if (!isJsonObject(value)) return [];
  // A subflow object, however it is identified: by the nodes it holds, by the
  // subflow fields it wrote, or -- the single-node case -- by being a node.
  if (authoringNodeList(value)) return [{ written: value }];
  if (isNodeLike(value)) return [{ written: { nodes: [value] } }];
  if (isSubflowLike(value)) return [{ written: value }];
  return subflowsFromMap(value);
}

/**
 * `subflows` written as an array: of subflow objects, of node lists, or of the
 * nodes themselves.
 *
 * The nodes case is decided by what the entries are, not by what they are
 * called: when no entry holds a node list and at least one names a definition
 * or carries parameters, the array is the Flow's steps rather than its
 * subflows. An entry that holds a node list settles it the other way for the
 * whole array, so a plan that wrote real subflows is never taken apart.
 */
function subflowsFromArray(value: readonly JsonValue[]): AuthoringWrittenSubflow[] {
  const entries = value.filter((item): item is JsonObject | JsonValue[] => isJsonObject(item) || Array.isArray(item));
  const objects = entries.filter(isJsonObject);
  if (objects.length && objects.length === entries.length && !objects.some((item) => authoringNodeList(item)) && objects.some(isNodeLike)) {
    return [{ written: { nodes: objects } }];
  }
  return entries.map((item) => (Array.isArray(item) ? { written: { nodes: item } } : { written: item }));
}

/**
 * `subflows` written as an object keyed by subflow name or id.
 *
 * Every value has to be a subflow -- an object, or the node list itself -- for
 * the object to be read as a map. A leftover scalar means this was one subflow
 * object all along, which the checks above have already settled, or that it is
 * not a subflow collection at all, and refusing it names what it was.
 */
function subflowsFromMap(value: JsonObject): AuthoringWrittenSubflow[] {
  const keys = Object.keys(value);
  const entries = keys.flatMap((key): AuthoringWrittenSubflow[] => {
    const item = value[key];
    if (Array.isArray(item)) return [{ written: { nodes: item }, namedBy: key }];
    return isJsonObject(item) ? [{ written: item, namedBy: key }] : [];
  });
  return entries.length && entries.length === keys.length ? entries : [];
}

/** A node list one level down, where the plan wrapped its whole body in a key. */
function nestedSubflows(plan: JsonObject, depth: number): AuthoringWrittenSubflow[] {
  if (depth >= MAX_NESTED_DEPTH) return [];
  const entries = Object.entries(plan).filter(([key]) => !SKIPPED_NESTED_KEYS.has(authoringKey(key)));
  const ordered = [
    ...entries.filter(([key]) => NESTED_PLAN_KEYS.has(authoringKey(key))),
    ...entries.filter(([key]) => !NESTED_PLAN_KEYS.has(authoringKey(key)))
  ];
  for (const [, value] of ordered) {
    if (Array.isArray(value)) {
      const objects = value.filter(isJsonObject);
      if (objects.length && objects.length === value.length && objects.every(isNodeLike)) return [{ written: { nodes: objects } }];
      continue;
    }
    if (!isJsonObject(value)) continue;
    const found = subflowList(value, depth + 1).filter((item) => authoringNodeList(item.written));
    if (found.length) return found;
  }
  return [];
}

/** The first value written under any of `keys`, matched as this directory matches keys. */
function valueUnder(value: JsonObject, keys: ReadonlySet<string>): JsonValue | undefined {
  for (const [key, item] of Object.entries(value)) if (keys.has(authoringKey(key))) return item;
  return undefined;
}

/** Whether an object is a step: it names the definition it runs, or carries the parameters one takes. */
function isNodeLike(value: JsonObject): boolean {
  for (const [key, item] of Object.entries(value)) {
    if (DEFINITION_KEYS.has(authoringKey(key)) && typeof item === "string" && item.trim()) return true;
  }
  return isJsonObject(value.parameters) || isJsonObject(value.params);
}

/**
 * Whether an object is a subflow that simply holds no nodes.
 *
 * A subflow field written as a string is what tells it apart from a map keyed
 * by subflow name: a map's values are subflows, so a map's `name` is an object,
 * never the string a subflow's own name is.
 */
function isSubflowLike(value: JsonObject): boolean {
  if (isNodeLike(value)) return false;
  return typeof value.key === "string" || typeof value.name === "string" || typeof value.role === "string" || Array.isArray(value.edges);
}

function itemKind(value: readonly JsonValue[]): string {
  const kinds = new Set(value.map((item) => (Array.isArray(item) ? "arrays" : item === null ? "nulls" : `${typeof item}s`)));
  return kinds.size === 1 ? [...kinds][0]! : "values";
}

function describeKeys(keys: readonly string[]): string {
  const shown = keys.slice(0, MAX_DESCRIBED_KEYS).map((key) => key.replace(/\s+/gu, " ").slice(0, MAX_DESCRIBED_KEY_LENGTH));
  return keys.length > shown.length ? `${shown.join(", ")} (+${keys.length - shown.length} more)` : shown.join(", ");
}
