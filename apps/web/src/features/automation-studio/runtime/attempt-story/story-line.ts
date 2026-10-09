/**
 * What kind of runtime record a story line was read from. Each names one
 * record on the persisted attempt trace (Core's `executor/contracts.ts`,
 * `AutomationStudioNodeAttemptTrace`), never a model's account of the run.
 *
 * The lifecycle records the state-aware recovery plan adds next (C11: frames,
 * handler runs, entry choices, true failure against a planned fail, in-run
 * repair) join this union as their own kinds when Core persists them; see
 * `lifecycle.ts`.
 */
export type RuntimeAttemptStoryKind =
  | "retried"
  | "interference"
  | "pace"
  | "readiness"
  | "child_run"
  | "skipped"
  | "state_routed"
  | "state_routing"
  | "defence"
  | "ladder";

/** One plain-words sentence saying what the runtime did for an attempt. */
export type RuntimeAttemptStoryLine = {
  kind: RuntimeAttemptStoryKind;
  text: string;
};

/**
 * How the story names steps. The trace holds node ids only; a caller that has
 * the Flow in hand names a step by its label instead.
 */
export type RuntimeAttemptStoryOptions = {
  stepName?(nodeId: string): string | undefined;
};
