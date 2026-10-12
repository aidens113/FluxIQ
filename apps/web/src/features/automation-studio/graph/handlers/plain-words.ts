// The plain words the handler views use: when a handler runs, where it
// applies, what it waits for, what happens after it, and where it was found.
// The product shows these instead of the stored codes (`before_next`,
// `nodes`, `route`), which are Core's vocabulary, not the person's.

import type { FlowFactCondition, FlowHandlerLevel, FlowHandlerRegistration, FlowHandlerScope, FlowLifecycleEvent, HandlerGraph } from "./types";

const EVENT_WORDS: Readonly<Record<FlowLifecycleEvent, string>> = {
  start: "When a part starts",
  before: "Before a step",
  retry: "Before trying again",
  fail: "When a step fails",
  before_next: "After a step succeeds"
};

/** When a handler runs, in words. */
export function flowHandlerEventWords(event: FlowLifecycleEvent): string {
  return EVENT_WORDS[event];
}

/** Where a handler applies, naming steps by their labels in `graph`. */
export function flowHandlerScopeWords(scope: FlowHandlerScope, graph: HandlerGraph): string {
  if (scope.kind === "automation") return "Whole automation";
  if (scope.kind === "subflow") return "This part";
  const labels = scope.nodeIds.map((id) => graph.nodes.find((node) => node.id === id)?.label ?? "");
  if (labels.every((label) => !label)) return labels.length === 1 ? "One step" : `${labels.length} steps`;
  return (labels.length === 1 ? "Step " : "Steps ") + labels.map((label) => (label ? quoted(label) : "an unnamed step")).join(", ");
}

/**
 * What happens once a Handler's body has run, from one Handler End's
 * parameters. A checkpoint is named by its id, which is the name its author
 * gave the step (a script's `go to search` returns to the checkpoint `search`),
 * and which a Route may name in a part that calls this one, not only here.
 */
export function flowHandlerThenWords(endParameters: Record<string, unknown>): string {
  const disposition = typeof endParameters.disposition === "string" ? endParameters.disposition : "unhandled";
  if (disposition === "resume") return "Carry on";
  if (disposition === "resolve") return "Use other results";
  if (disposition === "route") {
    const checkpointId = typeof endParameters.checkpointId === "string" ? endParameters.checkpointId.trim() : "";
    return checkpointId ? "Go back to " + quoted(checkpointId) : "Go back to a checkpoint";
  }
  return "Give up";
}

/** What a list of page conditions asks, in words; "Always" when it asks nothing. */
export function flowFactConditionWords(conditions: readonly FlowFactCondition[], graph: HandlerGraph): string {
  if (!conditions.length) return "Always";
  return conditions.map((condition) => conditionWords(condition, graph)).join(" and ");
}

/** Where an effective handler was found, nearest first. */
export function flowHandlerLevelWords(level: FlowHandlerLevel, graphName: string): string {
  if (level === "node") return "This step";
  if (level === "subflow") return "This part";
  if (level === "ancestor") return graphName ? "A part that calls this one: " + quoted(graphName) : "A part that calls this one";
  return "Whole automation";
}

/** A registration's own name: the Handler's label, or what an implicit registration does. */
export function flowHandlerRegistrationWords(registration: FlowHandlerRegistration, graph: HandlerGraph): string {
  const source = registration.source;
  const label = (nodeId: string) => graph.nodes.find((node) => node.id === nodeId)?.label || undefined;
  if (source.kind === "handler_node") return label(source.nodeId) ?? "Handler";
  if (source.kind === "clears_interference") return "Clear what is in the way with " + quoted(label(source.nodeId) ?? "a step");
  if (source.wayOn) return "Skip this optional step";
  return "Its own failure route to " + quoted(label(source.targetNodeId) ?? "another step");
}

function conditionWords(condition: FlowFactCondition, graph: HandlerGraph): string {
  const target = condition.target ?? {};
  if (condition.fact === "dialog" || target.kind === "dialog") {
    const name = typeof target.name === "string" && target.name.trim() ? quoted(target.name) + " " : "";
    return `the ${name}dialog ${condition.op === "absent" ? "is gone" : "is showing"}`;
  }
  const thing = targetWords(target, graph);
  const subject = condition.fact === "text" ? "the text of " + thing : condition.fact === "value" ? "the value of " + thing : thing;
  switch (condition.op) {
    case "exists": return thing + " is there";
    case "absent": return thing + " is gone";
    case "visible": return thing + " is showing";
    case "enabled": return thing + " can be used";
    case "equals": return subject + " is " + valueWords(condition.value);
    case "contains": return subject + " contains " + valueWords(condition.value);
    case "matches": return subject + " matches " + valueWords(condition.value);
    case "count": return "there are " + valueWords(condition.value) + " of " + thing;
    default: return "a page condition holds";
  }
}

/**
 * What a condition's target is, in words: the step that acts on the same
 * thing, when one in this graph does, since the target's own handle is a
 * code the person never wrote.
 */
function targetWords(target: Record<string, unknown>, graph: HandlerGraph): string {
  for (const key of ["name", "label", "text"]) {
    const value = target[key];
    if (typeof value === "string" && value.trim()) return quoted(value);
  }
  const handle = typeof target.handle === "string" ? target.handle : "";
  if (handle) {
    const step = graph.nodes.find((node) => {
      const stepTarget = node.parameterValues.target;
      return Boolean(stepTarget) && typeof stepTarget === "object" && (stepTarget as Record<string, unknown>).handle === handle;
    });
    if (step?.label) return "what " + quoted(step.label) + " acts on";
  }
  return "something on the page";
}

function valueWords(value: unknown): string {
  if (typeof value === "string") return quoted(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.input === "string") return "the input " + quoted(record.input);
    if (typeof record.value === "string") return "the value " + quoted(record.value);
  }
  return "nothing";
}

function quoted(text: string): string {
  return "“" + text + "”";
}
