import type { AutomationStudioPartSkipReason } from "../../../../runtime/project-parts/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowSubflow } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";

/** One Subflow of an applied Flow with its graph. */
export type AutomationStudioAppliedFlowPart = {
  subflow: AutomationStudioFlowSubflow;
  graphFlow: AutomationStudioFlowArtifact;
  /** The person asked for this one to be kept (their "save this"). Only a primary part needs it: the others are saved by default. */
  explicit?: boolean | undefined;
  /** The graph's revision as saved, when the caller knows it: the revision judgements are about. */
  sourceGraphRevision?: number | undefined;
};

export type AutomationStudioSaveProjectPartsInput = {
  pool: AutomationStudioProjectDatabasePool;
  projectId: string;
  flowId: string;
  subflows: readonly AutomationStudioAppliedFlowPart[];
  /** The person's request, as written. Compared with, never stored. */
  requestWords: string;
  /** What a person wrote for a part, by Subflow id. These win over the Subflow's own words. */
  words?: Readonly<Record<string, { name?: string | undefined; purpose?: string | undefined }>> | undefined;
  /** Where the build started. Only its origin is read. */
  startLocation?: string | undefined;
  /** The parameters that name a step's control, from the bound domain. Absent, Core's default. */
  controlParameterKeys?: ReadonlySet<string> | undefined;
  now?: number | undefined;
};

export type AutomationStudioSavedProjectPart = {
  subflowId: string;
  partId: string;
  version: number;
  /** `existing`: a version with the same shape was already in the library, and nothing was written. */
  status: "created" | "new_version" | "existing";
};

export type AutomationStudioSkippedProjectPart = {
  subflowId: string;
  reason: AutomationStudioPartSkipReason | "part.primary_not_explicit" | "part.call_cycle" | "part.call_too_deep";
  detail?: string;
};

export type AutomationStudioSaveProjectPartsResult = {
  saved: AutomationStudioSavedProjectPart[];
  skipped: AutomationStudioSkippedProjectPart[];
  /** The name of the error that kept the library from being written. The Flow is saved all the same. */
  failed?: string;
};
