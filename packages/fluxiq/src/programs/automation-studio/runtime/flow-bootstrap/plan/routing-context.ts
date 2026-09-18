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
// returned through `observeRouteState`, which the host bounds and sanitizes
// the way it bounds any evidence. This module bounds it again: a fixed number
// of paths and situations, each value cut to a printable length, and the
// whole within a byte budget. It adds nothing of its own to what the host
// returned, so it cannot widen what leaves the evidence boundary.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

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
  /** Each observed path and its value, bounded. A path not listed was absent. */
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

export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_ROUTING_LIMITS = {
  maxPaths: 24,
  maxSituations: 6,
  maxStateEntries: 24,
  maxValueLength: 300,
  maxDescriptionLength: 240,
  maxBytes: 6_000
} as const;

const PRINTABLE_PATH = /^(?:inputs|state)(?:\.[A-Za-z0-9_-]{1,64}){1,6}$/u;

/**
 * The routing context for one build. Every list is bounded and every value
 * cut; situations past the budget are dropped newest first, because the first
 * one -- where a run starts -- is the one the router will actually see.
 */
export function buildAutomationStudioFlowBootstrapRoutingContext(input: {
  current: string | AutomationStudioFlowBootstrapCurrentStructure;
  flowInputs: ReadonlyArray<{ id: string; valueType?: string; required?: boolean; description?: string }>;
  statePaths: ReadonlyArray<{ path: string; description?: string }>;
  observations: ReadonlyArray<{ seen: string; state: JsonObject }>;
  stateUnavailable?: string;
  lastRoute?: AutomationStudioFlowBootstrapLastRoute;
}): AutomationStudioFlowBootstrapRoutingContext {
  const limits = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_ROUTING_LIMITS;
  const paths: AutomationStudioFlowBootstrapRoutePath[] = [];
  for (const declared of input.flowInputs) {
    const path = `inputs.${declared.id}`;
    if (!PRINTABLE_PATH.test(path) || paths.some((entry) => entry.path === path)) continue;
    paths.push({
      path,
      ...(declared.description ? { description: bounded(declared.description, limits.maxDescriptionLength) } : {}),
      ...(declared.valueType ? { type: declared.valueType } : {}),
      ...(declared.required ? { required: true as const } : {})
    });
  }
  for (const declared of input.statePaths) {
    if (!PRINTABLE_PATH.test(declared.path) || !declared.path.startsWith("state.") || paths.some((entry) => entry.path === declared.path)) continue;
    paths.push({ path: declared.path, ...(declared.description ? { description: bounded(declared.description, limits.maxDescriptionLength) } : {}) });
  }
  const situations: AutomationStudioFlowBootstrapRouteSituation[] = [];
  const seenStates = new Set<string>();
  for (const observation of input.observations) {
    const state = flattenedState(observation.state);
    const key = JSON.stringify(state);
    if (seenStates.has(key)) continue;
    seenStates.add(key);
    situations.push({ seen: bounded(observation.seen, limits.maxDescriptionLength), state });
    if (situations.length >= limits.maxSituations) break;
  }
  const context: AutomationStudioFlowBootstrapRoutingContext = {
    decides: AUTOMATION_STUDIO_ROUTER_DECISION_TEXT,
    current: input.current,
    paths: paths.slice(0, limits.maxPaths),
    situations,
    ...(input.stateUnavailable ? { stateUnavailable: bounded(input.stateUnavailable, limits.maxDescriptionLength) } : {}),
    ...(input.lastRoute ? { lastRoute: input.lastRoute } : {})
  };
  while (context.situations.length > 1 && Buffer.byteLength(JSON.stringify(context), "utf8") > limits.maxBytes) context.situations.pop();
  return context;
}

/**
 * An observed state as `state.<path>` entries. Nested objects are walked,
 * a list becomes its items joined, and each value is cut to a printable
 * length; anything deeper than the path pattern allows is left out.
 */
function flattenedState(state: JsonObject): Record<string, JsonValue> {
  const limits = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_ROUTING_LIMITS;
  const entries: Array<[string, JsonValue]> = [];
  const visit = (value: JsonValue, path: string, depth: number): void => {
    if (entries.length >= limits.maxStateEntries || value === null) return;
    if (typeof value === "string") {
      entries.push([path, bounded(value, limits.maxValueLength)]);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      entries.push([path, value]);
      return;
    }
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string | number | boolean => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
      if (items.length) entries.push([path, bounded(items.join(" | "), limits.maxValueLength)]);
      return;
    }
    if (depth >= 6) return;
    for (const [key, child] of Object.entries(value)) {
      const next = `${path}.${key}`;
      if (PRINTABLE_PATH.test(next)) visit(child, next, depth + 1);
    }
  };
  visit(state, "state", 0);
  return Object.fromEntries(entries);
}

function bounded(text: string, limit: number): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}
