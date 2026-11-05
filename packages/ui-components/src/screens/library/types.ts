// The subflow library's records, as the screen reads them.
//
// **Restated from the contract**, as `chat/ports/results.ts` restates its own: this package does not
// depend on `@fluxiq/contracts` (tsc would pass through the workspace paths, and the build, which has
// none, would fail). The card holds no hash or digest: those never reach a person, so the client's
// adapter leaves them out. Words a person reads (`name`, `purpose`, `says`, `reason`) are Core's.

/** A lasting class an act can have, in Core's display order. */
export type SubflowLastingClass = "move_money" | "delete" | "send_or_publish" | "modify_existing" | "create_new";

/** How far a subflow has earned trust. */
export type SubflowTrustTier = "unproven" | "provisional" | "established";

/** A value a subflow takes or hands back. */
export type SubflowValue = { id: string; name: string; required: boolean };

/** What must be true at a subflow's start: how many conditions, and what they ask in a person's words. */
export type SubflowCheck = { conditions: number; says?: string };

/** A smaller subflow a subflow calls. */
export type SubflowCall = { partId: string; version: number };

/** One saved subflow, as the library lists it. */
export type SubflowCard = {
  partId: string;
  version: number;
  name: string;
  purpose: string;
  /** Origins it runs on, such as `https://shop.example`. */
  sites: string[];
  inputs: SubflowValue[];
  outputs: SubflowValue[];
  /** The literals its steps hold, shown because the worst false match is a fixed value. */
  fixedValues: string[];
  lastingClasses: SubflowLastingClass[];
  startCheck?: SubflowCheck;
  endCheck?: SubflowCheck;
  calls: SubflowCall[];
  trust: {
    tier: SubflowTrustTier;
    counts: { judgedYes: number; zeroModelRuns: number; failures: number };
    /** Epoch milliseconds; set when it has failed since. */
    lastFailureAtMs?: number;
  };
};

/** One step of a subflow, in the order a run reaches it. */
export type SubflowStep = { label: string; lastingClasses: SubflowLastingClass[] };

/** A subflow another one calls, with what that calls in turn. */
export type SubflowCallNode = { partId: string; version: number; name: string; calls: SubflowCallNode[] };

/** A newer version of a subflow than the one a caller pins: Core's own words for it, and whether it has passed a run elsewhere. */
export type SubflowCallerNewer = { passed: boolean; said: string };

/**
 * Who uses a subflow: an automation, or another subflow. An automation is the Flow it opens (`flowId`) and its `name`
 * when the client could read one; `newer` is set when a newer version of this subflow exists.
 */
export type SubflowCaller = { kind: "flow"; flowId?: string; name?: string; newer?: SubflowCallerNewer } | { kind: "part"; partId: string };

/** One subflow opened: its card with what the person reads beside it. */
export type SubflowDetail = { card: SubflowCard; steps: SubflowStep[]; calls: SubflowCallNode[]; callers: SubflowCaller[] };

/** Every reason the library says no, with nothing on the site changed. */
export type SubflowRefusalCode =
  | "part.not_found" | "part.wrong_site" | "part.not_at_start" | "part.input_missing" | "part.input_unknown" | "part.act_not_allowed" | "part.confirm_repeat"
  | "part.calls_not_available" | "part.repeat_refused" | "parts.unavailable" | "parts.run_id_refused";

/** A refusal is a value, not a failed read: a closed code, the classes it is about, and Core's words. */
export type SubflowRefusal = { refused: true; code: SubflowRefusalCode; message: string; classes?: SubflowLastingClass[] };

/** A page of the library. */
export type SubflowListing = { refused: false; parts: SubflowCard[]; nextCursor: string | null; hasMore: boolean };

/** One subflow opened, or why it cannot be. */
export type SubflowReading = { refused: false; detail: SubflowDetail };

/** Saving a subflow of a Flow into the library: kept, or why not in Core's words. */
export type SubflowSaveOutcome = { saved: true; partId: string; version: number; status: "created" | "new_version" | "existing" } | { saved: false; code: string; message: string };

/** Where a run stopped: the step in a person's words, and why. */
export type SubflowRunStop = { stepLabel: string; reason: string };

/** A run that took place. A run has no check here, so it never says it succeeded, only that it finished. */
export type SubflowRunOutcome = {
  refused: false;
  status: "succeeded" | "failed" | "stopped" | "cancelled";
  /** What it handed back, by output id. */
  outputs: Record<string, unknown>;
  /** Rows its steps stored. */
  rowCount: number;
  stoppedAt?: SubflowRunStop;
  acts: SubflowLastingClass[];
};
