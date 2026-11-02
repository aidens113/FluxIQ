import type { AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION } from "./schema.ts";
import type { AutomationStudioActionPermissionActionKind } from "./action-kind.ts";
import type { AutomationStudioActionPermissionStage } from "./stage.ts";
import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

export type AutomationStudioActionPermissionRequest = {
  schemaVersion: typeof AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION;
  /** Stable for the life of the request: what a store would hold it under. */
  requestId: string;
  requestedAtMs: number;
  /** The action: when it would happen, what would do it, which one, and the domain's verb for it. */
  action: { kind: AutomationStudioActionPermissionActionKind; id: string; ref: string; verb: string };
  /** What the action acts on, as a person would recognise it. `name` is null when it could not be carried. */
  control: { name: string | null; kind: string | null };
  /** Every lasting consequence the domain declared for the action, in Core's order. */
  consequences: AutomationStudioActionConsequence[];
  /** Those the run was not permitted: exactly what a later run's permission must add. Never empty. */
  missing: AutomationStudioActionConsequence[];
  /** Why the run wanted it: what it was doing, and the instructions it was carrying out. */
  reason: { stage: AutomationStudioActionPermissionStage; instructionIds: string[] };
  /**
   * What the run already held, and why: the classes a person permitted, and the
   * classes the person's own instruction asked for, each with their words.
   * `missing` is what neither covers.
   */
  authority: {
    granted: AutomationStudioActionConsequence[];
    instructed: Array<{ consequence: AutomationStudioActionConsequence; instructionId: string; quote: string }>;
  };
  /** Core's own sentence for the person being asked. Never a model's. */
  sentence: string;
};
