// The project's parts library, as the extension and the panel read it: search the
// saved parts, read one, and keep a Subflow of a Flow as one. Everything returned
// is names, words a person wrote, hashes and counts. A part's page evidence stays
// in its snapshot, and none of it is answered here.
import type { AutomationStudioAttemptActClass, AutomationStudioSubflowCard, AutomationStudioTrustTier } from "@fluxiq/contracts/automation";
import type { JsonValue } from "../../core/index.ts";

/**
 * What any of the three answers, in place of its own shape, when it cannot: a closed code and plain words. It is the
 * payload of an ordinary successful response, so a relay passes it on unchanged.
 */
export type ProjectPartRefusal = { refused: true; code: "parts.unavailable" | "parts.not_found"; message: string };

/** `list-project-parts`. Every filter narrows; none widens. */
export type ListProjectPartsRequest = {
  projectId: string;
  /** The person's words, searched in each part's name, purpose and port names. Any of them matches; the best match comes first. */
  query?: string;
  /** An origin (`https://shop.example`) or a bare host, which is read as https. */
  site?: string;
  /** The name (or id) of an input the part takes. Several: every one. */
  inputName?: string | string[];
  /** The name (or id) of an output the part hands back. Several: every one. */
  outputName?: string | string[];
  /** A lasting class its steps can cause. Several: every one. */
  lasting?: string | string[];
  /** Trust tiers to keep: `unproven`, `provisional`, `established`. Several: any of them. */
  trust?: string | string[];
  /** Parts a Flow's own graph calls. */
  usedByFlowId?: string;
  /** Parts first saved from a Flow. */
  sourceFlowId?: string;
  /** 1 to 50; 25 when left out. */
  limit?: number;
  cursor?: string | null;
};

export type ListProjectPartsResponse = { parts: AutomationStudioSubflowCard[]; nextCursor: string | null; hasMore: boolean };

/** `get-project-part`. Without a version, the newest. */
export type GetProjectPartRequest = { projectId: string; partId: string; version?: number };

/** One step of a part, in the order a run reaches it, in words a person reads. */
export type ProjectPartStep = { label: string; lastingClasses: AutomationStudioAttemptActClass[] };

/** A part this one calls, with what that one calls in turn. */
export type ProjectPartCallNode = { partId: string; version: number; name: string; calls: ProjectPartCallNode[] };

export type ProjectPartVersionEntry = { version: number; createdAtMs: number; trust: AutomationStudioSubflowCard["trust"] };

/**
 * Who calls the part, each by the version it pins. A Flow's graph calls the part
 * at `version`; another part's version (`callerVersion`) calls it at `version`.
 */
export type ProjectPartCaller =
  | { kind: "flow"; flowId: string; nodeId: string; version: number }
  | { kind: "part"; partId: string; callerVersion: number; nodeId: string; version: number };

export type GetProjectPartResponse = {
  card: AutomationStudioSubflowCard;
  steps: ProjectPartStep[];
  calls: ProjectPartCallNode[];
  versions: ProjectPartVersionEntry[];
  callers: ProjectPartCaller[];
};

/** `save-project-part`: a person's "save this" for one Subflow of a Flow. */
export type SaveProjectPartRequest = {
  projectId: string;
  flowId: string;
  subflowId: string;
  /** The person's name for the part, used when it reads as words. */
  name?: string;
  /** What it is for, in the person's words. */
  purpose?: string;
};

/** Saved, or why not in plain words with its stable code (`part.*` or `parts.*`). */
export type SaveProjectPartResponse =
  | { saved: true; partId: string; version: number; status: "created" | "new_version" | "existing" }
  | { saved: false; code: string; message: string };

/** The tiers `trust` filters by. */
export const PROJECT_PART_TRUST_TIERS: readonly AutomationStudioTrustTier[] = Object.freeze(["unproven", "provisional", "established"] as const);

/** `run-project-part`: run one saved part now, with these values, and no model. */
export type RunProjectPartRequest = {
  projectId: string;
  partId: string;
  /** The version to run; the newest when left out. */
  version?: number;
  /** What the part is given, by input id. */
  inputs?: Record<string, JsonValue>;
  /** The lasting classes the person asked for. Left out, nothing lasting may happen. */
  permittedConsequences?: string[];
  /** The person was told this part does its acts again, and said go ahead. */
  acknowledgedRepeat?: boolean;
  /** The id the new run is stored under, a UUID, so a caller can read it back whatever happens to this request. */
  newRunId?: string;
};

/** Where a part stopped: a step in a person's words, and why in plain words. Never a target or page text. */
export type ProjectPartRunStop = { stepLabel: string; reason: string };

export type RunProjectPartResponse = {
  runId: string;
  status: "succeeded" | "failed" | "stopped" | "cancelled";
  /** What the part handed back, by output id. */
  outputs: Record<string, JsonValue>;
  /** The rows its steps stored under the run, when they stored any; read with the run's dataset endpoints. */
  rows?: { runId: string; datasets: { datasetId: string; rowCount: number }[]; unread?: true };
  stoppedAt?: ProjectPartRunStop;
  /** The lasting classes of the acts that landed. */
  acts: AutomationStudioAttemptActClass[];
  modelCalls: 0;
};

/** Why a part was not run, or not run yet. Nothing on the site changed. */
export type RunProjectPartRefusal = {
  refused: true;
  code:
    | "part.not_found" | "part.wrong_site" | "part.not_at_start" | "part.input_missing" | "part.input_unknown" | "part.act_not_allowed" | "part.confirm_repeat"
    | "part.calls_not_available" | "part.repeat_refused" | "parts.unavailable" | "parts.run_id_refused";
  message: string;
  /** The lasting classes the refusal is about. */
  classes?: AutomationStudioAttemptActClass[];
};
