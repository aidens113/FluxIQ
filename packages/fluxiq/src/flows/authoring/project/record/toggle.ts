import type { JsonObject, JsonValue } from "../../../../core/index.ts";

/**
 * One press the domain answered as a toggle (t775, t787): the node it ran;
 * where it was made, while exploring (the call, the handles its target named)
 * or in a trial's pass (the executed trial nodes); the domain's opaque
 * signature of the state it left, never read inside; and the node that sets
 * that state itself, where the domain named one.
 */
export type AutomationStudioProjectBuildToggle = {
  recordedAt: number;
  from: "explored" | "trial";
  node: string;
  callId?: string;
  handles: string[];
  /** An exploration press only: its `target` as the domain resolved it, opaque, which a step is also tied by (t792). */
  target?: JsonValue;
  trialNodes?: string[];
  /**
   * A trial's press only: the parameters its node ran with, Core's
   * `ensureState` taken off (t792), the identity a later revision's step is
   * tied to it by (`flow-bootstrap/script-statements/toggle-tie.ts`). Absent
   * where the trial's graph did not show the node.
   */
  trialParameters?: JsonObject;
  signature: JsonObject;
  /** The actual observed pre-state; absent on legacy records, never inferred. */
  beforeSignature?: JsonObject;
  idempotentWith?: string;
};
