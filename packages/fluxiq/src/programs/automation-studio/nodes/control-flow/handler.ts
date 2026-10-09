// The handler registration node, and the vocabulary it is authored in
// (state-aware recovery plan, C3 and C4).
//
// A `builtin.control.handler` node is a registration, not a step: no route
// enters it, and the run never walks into it. Its `body` port leads to ordinary
// nodes that end at `builtin.control.handler-end` (`./handler-end.ts`), and the
// lifecycle dispatcher (`runtime/executor/lifecycle/`) runs that body when the
// registration's `event` fires inside its `scope` and its `when` facts are all
// `true`. Everything here is declarative JSON stored in the versioned graph.
//
// The event list and the scope kinds live here, beside the node whose
// parameters they are, because three readers need the same words: the Flow
// validator (`model/validation/flow.ts`), the runtime that dispatches, and the
// editor, which reads the event options off this definition.

import { defineBuiltinNode } from "../shared/definition.ts";

/** The node definition that stores one handler registration. */
export const AUTOMATION_STUDIO_HANDLER_DEFINITION_ID = "builtin.control.handler";

/**
 * The lifecycle boundaries a handler may register for (C3), in the order they
 * can occur around one node: `start` once per new frame before entry
 * selection, `before` each attempt, `retry` once Core has permitted another
 * attempt, `fail` once retries are spent or the failure is not retryable, and
 * `before_next` after verified success, before the edge is chosen.
 */
export const AUTOMATION_STUDIO_LIFECYCLE_EVENTS = Object.freeze(["start", "before", "retry", "fail", "before_next"] as const);

/** One lifecycle boundary a handler may register for. */
export type AutomationStudioLifecycleEvent = (typeof AUTOMATION_STUDIO_LIFECYCLE_EVENTS)[number];

/**
 * Where a registration applies (C4): the nodes it names, the Subflow graph it
 * is stored in (and, when `inherit` is not false, the active frames that graph
 * calls), or the whole automation, which only the `recovery`-role Subflow
 * graph may declare.
 */
export const AUTOMATION_STUDIO_HANDLER_SCOPE_KINDS = Object.freeze(["automation", "subflow", "nodes"] as const);

/** One kind of handler scope. */
export type AutomationStudioHandlerScopeKind = (typeof AUTOMATION_STUDIO_HANDLER_SCOPE_KINDS)[number];

export const handlerNode = defineBuiltinNode({
  id: AUTOMATION_STUDIO_HANDLER_DEFINITION_ID,
  label: "Handler",
  description: "Registers steps to run at a lifecycle point, such as before a step or when it fails. Its body ends at a Handler End.",
  class: "control-flow",
  scope: "both",
  inputs: [],
  outputs: [{ id: "body", label: "Body", valueType: "any", role: "branch" }],
  parameters: [
    {
      id: "event",
      label: "Runs at",
      description: "The lifecycle point this handler is registered for.",
      valueType: "string",
      defaultValue: "fail",
      options: [
        { label: "When a part starts", value: "start" },
        { label: "Before each attempt", value: "before" },
        { label: "Before a permitted retry", value: "retry" },
        { label: "When a step fails", value: "fail" },
        { label: "After a step succeeds", value: "before_next" }
      ]
    },
    {
      id: "scope",
      label: "Applies to",
      description: "Where the handler applies: { kind: \"nodes\", nodeIds }, { kind: \"subflow\", inherit }, or { kind: \"automation\" } in the recovery part.",
      valueType: "json",
      defaultValue: { kind: "subflow", inherit: true }
    },
    {
      id: "when",
      label: "Only when",
      description: "Fact conditions that must all be true for the handler to run. A condition the host cannot settle does not count as true.",
      valueType: "json",
      defaultValue: []
    },
    {
      id: "order",
      label: "Order",
      description: "Lower runs first among handlers at the same level; ties keep the order the graph lists them in.",
      valueType: "number",
      defaultValue: 0
    },
    {
      id: "completionCheck",
      label: "Worked when",
      description: "Fact conditions that prove the recovery worked. Required for handlers that run before an attempt or a retry.",
      valueType: "json",
      defaultValue: []
    },
    {
      id: "maxRuns",
      label: "Most runs per occurrence",
      description: "How many times this handler may run for one occurrence of its event.",
      valueType: "number",
      defaultValue: 1
    }
  ],
  icon: "life-buoy",
  // Never reached by the step loop: no route enters a registration. The
  // dispatcher enters the body itself, which is the route this answers with.
  execute: () => ({ status: "success", route: "body", outputs: {} })
});
