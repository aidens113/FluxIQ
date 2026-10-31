import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type {
  AutomationStudioProjectAgentRole,
  AutomationStudioProjectBuilderReturn,
  AutomationStudioProjectDecisionLogEntry,
  AutomationStudioProjectReceiptRef,
  AutomationStudioProjectStructurePlan,
  AutomationStudioProjectSubflowBrief,
  AutomationStudioProjectTaskSpec
} from "../contracts/index.ts";

// The build record: the product's working document for one project build,
// persisted under the Flow's directory as the build proceeds.
//
// The supervisor owns one main file. Each brief's return is its own file, as
// each worker here writes its own report, so builders running at the same time
// never write the same file. Receipts stay with their candidate owner; the
// record holds references.

/** Which build a call is about. */
export type AutomationStudioProjectBuildRef = { projectId: string; flowId: string; buildId: string };

export const AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS = Object.freeze(["promoted", "partial", "blocked", "cancelled"] as const);

export type AutomationStudioProjectBuildEnding = {
  outcome: (typeof AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS)[number];
  reason: string;
  at: number;
};

/** The supervisor's main file. Every list is in the order it was written. */
export type AutomationStudioProjectBuildRecord = {
  kind: "project_build_record";
  schemaVersion: 1;
  buildId: string;
  projectId: string;
  flowId: string;
  instructionDigest: string;
  sourceIds: string[];
  createdAt: number;
  updatedAt: number;
  taskSpecs: Array<{ revision: number; recordedAt: number; taskSpec: AutomationStudioProjectTaskSpec }>;
  plans: Array<{ revision: number; recordedAt: number; plan: AutomationStudioProjectStructurePlan }>;
  briefs: Array<{ recordedAt: number; brief: AutomationStudioProjectSubflowBrief }>;
  /** Receipts the supervisor's own whole-candidate trials produced; builders' trials are in their returns. */
  receipts: Array<{ recordedAt: number; briefId?: string; receipt: AutomationStudioProjectReceiptRef }>;
  allowances: Array<{ recordedAt: number; role: AutomationStudioProjectAgentRole; briefId?: string; usd: number }>;
  /** The project's lasting-act ledger: one writer, every act of the build with the agent that made it and its lasting classes. */
  lastingActs: AutomationStudioProjectBuildLastingAct[];
  decisions: Array<{ recordedAt: number; entry: AutomationStudioProjectDecisionLogEntry }>;
  /**
   * Every press the domain answered as a toggle, as the build's record of them
   * held it (`flow-bootstrap/explored-toggles.ts`; t792): what a later step on
   * the same control was given `ensureState` from. Absent until the first.
   */
  toggles?: AutomationStudioProjectBuildToggle[];
  ending?: AutomationStudioProjectBuildEnding;
};

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

/**
 * Who made a lasting act: the supervisor (its whole-candidate trials), or the
 * brief whose builder, repair or reset made it, under the role that brief ran as.
 */
export type AutomationStudioProjectBuildActOwner = { role: "supervisor" } | { role: Exclude<AutomationStudioProjectAgentRole, "supervisor">; briefId: string };

/**
 * One lasting act of the build, as the project ledger recorded it
 * (`flow-bootstrap/site-reset/project-ledger.ts`): its id, unique across the
 * build; what it did; who made it; every lasting class it declared, whether or
 * not its brief was permitted it (the person's own instruction can permit an
 * act too); and whether the site's own controls can undo it.
 */
export type AutomationStudioProjectBuildLastingAct = {
  recordedAt: number;
  act: string;
  owner: AutomationStudioProjectBuildActOwner;
  consequences: AutomationStudioActionConsequence[];
  description: string;
  undoable: boolean;
};

/** One brief's return file. Written once. */
export type AutomationStudioProjectBuildReturnRecord = {
  kind: "project_builder_return";
  schemaVersion: 1;
  buildId: string;
  briefId: string;
  recordedAt: number;
  builderReturn: AutomationStudioProjectBuilderReturn;
};

/** The main file with every return written so far, as read back. */
export type AutomationStudioProjectBuildRecordView = {
  record: AutomationStudioProjectBuildRecord;
  returns: AutomationStudioProjectBuildReturnRecord[];
};

/** What a later supervisor invocation reads first, as an agent here reads `Current State`. */
export type AutomationStudioProjectBuildSummary = {
  buildId: string;
  instructionDigest: string;
  taskSpec?: { revision: number; digest: string; parts: number };
  plan?: { revision: number; digest: string; subflows: string[] };
  briefs: Array<{
    briefId: string;
    kind: AutomationStudioProjectSubflowBrief["kind"];
    subflowKey: string;
    /** Whether the brief was written against the latest structure plan. */
    current: boolean;
    returned?: { outcome: AutomationStudioProjectBuilderReturn["outcome"]; reason: string; spentUsd: number };
  }>;
  spentUsd: number;
  lastingActs: number;
  lastDecision?: AutomationStudioProjectDecisionLogEntry;
  ending?: AutomationStudioProjectBuildEnding;
};
