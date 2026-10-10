/**
 * What kind of runtime record a story line was read from. Each names one
 * record on the persisted attempt trace (Core's `executor/contracts.ts`,
 * `AutomationStudioNodeAttemptTrace`), never a model's account of the run.
 *
 * The state-aware recovery plan's records (C1, C11) each have their own kind:
 * a called part (`part`), where a frame began (`entry`), a handler's run
 * (`handler`), the layers the client closed (`cleared_layers`), what a failure
 * counted as (`failure_class`) and an in-run repair (`repair`); see
 * `lifecycle.ts`.
 */
export type RuntimeAttemptStoryKind =
  | "retried"
  | "interference"
  | "pace"
  | "readiness"
  | "child_run"
  | "part"
  | "skipped"
  | "already_done"
  | "state_routed"
  | "state_routing"
  | "defence"
  | "entry"
  | "handler"
  | "cleared_layers"
  | "failure_class"
  | "repair"
  | "ladder";

/** One plain-words sentence saying what the runtime did for an attempt. */
export type RuntimeAttemptStoryLine = {
  kind: RuntimeAttemptStoryKind;
  text: string;
};

/**
 * How the story names steps, handlers and parts. The trace holds ids only; a
 * caller that has the Flow in hand names a step by its label, a handler by its
 * situation and a part by its name instead.
 */
export type RuntimeAttemptStoryOptions = {
  stepName?(nodeId: string): string | undefined;
  handlerName?(handlerId: string): string | undefined;
  partName?(subflowId: string): string | undefined;
};
