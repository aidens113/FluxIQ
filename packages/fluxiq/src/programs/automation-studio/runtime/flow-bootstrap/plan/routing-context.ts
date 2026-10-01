// What a model is shown so it can decide how a Flow routes.
//
// A route is a promise about situations: "when the run starts here, do this".
// A model can only keep that promise if it is told four things -- how the
// router decides, what the Flow already has, which values a condition can
// test, and which situations were actually seen -- and, when it is changing a
// Flow that ran, which route that run took and why. Before this existed a
// model was shown none of them, and every route it wrote was a label.
//
// Every value here is either Core's own (the Flow's structure, its declared
// inputs, a route decision's reasons) or a state the host observed and
// returned through `observeRouteState`, which the host sanitizes the way it
// sanitizes any evidence. This module carries all of it (2026-09-30, "the
// model sees the whole page"): every declared path, every distinct situation,
// every observed value at its full length and depth. The packet builder
// withholds a secret-shaped value and refuses a denied key; nothing here cuts.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH } from "./route-condition.ts";

/** How the router decides, in the words the model reads. */
export const AUTOMATION_STUDIO_ROUTER_DECISION_TEXT = "The router picks one block before any step runs, with no model: it tests each block's `when:` condition, in the order the blocks are written, against the run's inputs and the state observed where the run starts. The first block whose condition holds runs; when none holds, the steps written outside every block run.";

export type AutomationStudioFlowBootstrapRoutePath = {
  /** `inputs.<id>` or `state.<...>`, exactly as a condition writes it. */
  path: string;
  /** What the value is, in the words of whoever declared it. */
  description?: string;
  /** For a declared input. */
  type?: string;
  required?: true;
};

export type AutomationStudioFlowBootstrapRouteSituation = {
  /** Where it was seen: where the run starts, or after which exploration step. */
  seen: string;
  /** Each observed path and its value, whole. A path not listed was absent. */
  state: Record<string, JsonValue>;
};

export type AutomationStudioFlowBootstrapCurrentRoute = {
  /** The block the route runs, by the label a script writes. */
  subflow: string;
  /** Its condition, written the way a `when:` line writes one. */
  when: string;
};

export type AutomationStudioFlowBootstrapCurrentStructure = {
  routes: AutomationStudioFlowBootstrapCurrentRoute[];
  /** What runs when no route holds: a block's label, or that the run fails. */
  fallback: string;
  subflows: Array<{ label: string; name: string; role: string; steps: number }>;
};

export type AutomationStudioFlowBootstrapLastRoute = {
  /** Which block the run under review ran, or that it ran none. */
  took: string;
  fallbackUsed: boolean;
  /** Each route the router checked, in order, and the reason it gave. */
  checked: Array<{ subflow: string; held: boolean; why: string }>;
};

export type AutomationStudioFlowBootstrapRoutingContext = {
  decides: string;
  /** The Flow's structure as it stands, or a sentence saying it has none. */
  current: string | AutomationStudioFlowBootstrapCurrentStructure;
  /** Every path a condition can test. */
  paths: AutomationStudioFlowBootstrapRoutePath[];
  /** The distinct states observed, oldest first; the first is where a run starts. */
  situations: AutomationStudioFlowBootstrapRouteSituation[];
  /** Why no state could be observed, when none was. */
  stateUnavailable?: string;
  /** For a change to a Flow that ran: the route that run took, and why. */
  lastRoute?: AutomationStudioFlowBootstrapLastRoute;
};

/** A recursion guard for walking an observed state, not a size bound. */
const MAX_STATE_DEPTH = 64;

/**
 * The routing context for one build: every declared path a condition can test
 * (the route grammar's own paths, `route-condition.ts`), every distinct
 * observed situation oldest first, and every observed value whole.
 */
export function buildAutomationStudioFlowBootstrapRoutingContext(input: {
  current: string | AutomationStudioFlowBootstrapCurrentStructure;
  flowInputs: ReadonlyArray<{ id: string; valueType?: string; required?: boolean; description?: string }>;
  statePaths: ReadonlyArray<{ path: string; description?: string }>;
  observations: ReadonlyArray<{ seen: string; state: JsonObject }>;
  stateUnavailable?: string;
  lastRoute?: AutomationStudioFlowBootstrapLastRoute;
}): AutomationStudioFlowBootstrapRoutingContext {
  const paths: AutomationStudioFlowBootstrapRoutePath[] = [];
  for (const declared of input.flowInputs) {
    const path = `inputs.${declared.id}`;
    if (!AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH.test(path) || paths.some((entry) => entry.path === path)) continue;
    paths.push({
      path,
      ...(declared.description ? { description: flat(declared.description) } : {}),
      ...(declared.valueType ? { type: declared.valueType } : {}),
      ...(declared.required ? { required: true as const } : {})
    });
  }
  for (const declared of input.statePaths) {
    if (!AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH.test(declared.path) || !declared.path.startsWith("state.") || paths.some((entry) => entry.path === declared.path)) continue;
    paths.push({ path: declared.path, ...(declared.description ? { description: flat(declared.description) } : {}) });
  }
  const situations: AutomationStudioFlowBootstrapRouteSituation[] = [];
  const seenStates = new Set<string>();
  for (const observation of input.observations) {
    const state = flattenedState(observation.state);
    const key = JSON.stringify(state);
    if (seenStates.has(key)) continue;
    seenStates.add(key);
    situations.push({ seen: flat(observation.seen), state });
  }
  return {
    decides: AUTOMATION_STUDIO_ROUTER_DECISION_TEXT,
    current: input.current,
    paths,
    situations,
    ...(input.stateUnavailable ? { stateUnavailable: flat(input.stateUnavailable) } : {}),
    ...(input.lastRoute ? { lastRoute: input.lastRoute } : {})
  };
}

/**
 * An observed state as `state.<path>` entries, every one of them. Nested
 * objects are walked, and so are objects inside a list; a list's scalar items
 * are joined, the form a condition compares against. No value is cut, and no
 * key is left out for its spelling or its depth.
 */
function flattenedState(state: JsonObject): Record<string, JsonValue> {
  const entries: Array<[string, JsonValue]> = [];
  const visit = (value: JsonValue, path: string, depth: number): void => {
    if (value === null) return;
    if (typeof value === "string") {
      entries.push([path, flat(value)]);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      entries.push([path, value]);
      return;
    }
    if (depth >= MAX_STATE_DEPTH) return;
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string | number | boolean => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
      if (items.length) entries.push([path, flat(items.join(" | "))]);
      value.forEach((item, index) => {
        if (item !== null && typeof item === "object") visit(item, `${path}.${index}`, depth + 1);
      });
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`, depth + 1);
  };
  visit(state, "state", 0);
  return Object.fromEntries(entries);
}

/** Whitespace collapsed, nothing cut. */
function flat(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
