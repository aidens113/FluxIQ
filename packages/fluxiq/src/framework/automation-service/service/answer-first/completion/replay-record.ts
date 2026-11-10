// What a replay of a saved Flow did, as the completion check reads it (task speed S9,
// `./replay-stands.ts`). Built by the attempt from its Flow run stage's outcome and the saved Flow it
// ran; every field is Core's own record, closed words and counts, never the page's or a model's.

/** What a step's reads came to, by shape: the columns kept and whether any row was. Never the rows themselves. */
export type AutomationStudioAnswerFirstReadShape = {
  columns: readonly string[];
  empty: boolean;
};

/** One step of the replay, by its position in the saved draft. */
export type AutomationStudioAnswerFirstReplayStep = {
  position: number;
  ran: "passed" | "skipped" | "failed" | "not_reached";
  /**
   * Why a skipped step was passed over, in Core's closed words: an act already done or a control already
   * in its asked state (the run gate's and the stated toggle's), a sometimes-present step whose control
   * was not there (`absent`, or `absent_not_done` when what it does was not done), a step whose page
   * never arose (`not_arisen`), or the run routed by the page to another step (`routed_elsewhere`).
   */
  skipped?: "already_done" | "already_in_state" | "absent" | "absent_not_done" | "not_arisen" | "routed_elsewhere" | undefined;
  /** A check only a person could clear met this step, and the run went on after they cleared it. */
  personCleared?: boolean | undefined;
  /** Attempts the step took past its first. */
  retries?: number | undefined;
};

export type AutomationStudioAnswerFirstReplayRecord = {
  /** The saved Flow that ran: its label, whether its one judged whole run is behind it, and what that run read. */
  saved: {
    label: "confirmed" | "refuted" | "unverified";
    provenWhole: boolean;
    /** The accepted run's read shape. Absent when none was kept, which a replay cannot be compared with. */
    shape?: AutomationStudioAnswerFirstReadShape | undefined;
  };
  /** Whether the run reached the Flow's end, and each step. */
  reachedEnd: boolean;
  steps: readonly AutomationStudioAnswerFirstReplayStep[];
  /** Anything after the run changed the page before this completion: a repair, a round, a step run again. */
  repaired: boolean;
};
