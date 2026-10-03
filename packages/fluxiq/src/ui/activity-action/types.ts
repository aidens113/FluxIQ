// The shapes a chat card for one action FluxIQ takes is built from, shared by
// every client that shows the activity stream (Core's panel chat and any
// importing repository's chat), so each draws the same card with the same icon.

/** What kind of action a card shows; each has one icon and one short name. */
export type ActivityActionKind =
  | "click"
  | "type"
  | "navigate"
  | "read"
  | "look"
  /**
   * Reading an earlier call's result back (`core.recall_result`). It looks at
   * no page: one that found nothing read "Look · Didn't work: it wasn't on the
   * page" (t194, `run-murwcmx2-a1c6edf7`).
   */
  | "recall"
  | "wait"
  | "person_check"
  | "permission"
  | "draft"
  | "test"
  /**
   * A check that a run's result answers the request. It runs nothing, so it is
   * no test run: a real run's result check read "Test run · Working on it"
   * (t193, `run-muqiojz4-04a7a8fc`).
   */
  | "result_check"
  | "repair"
  /**
   * The Flow's own control steps, which act on the Flow's paths and never on
   * the page: two paths joining (`merge`), one path chosen among several
   * (`branch`, `switch`, `parallel`), and steps repeated (`for-each`, `loop`).
   * Before these a merge step's card read "Action · the page" (U-A2,
   * `run-muq6lqnw-fdfa7aac`): neither the name nor the target was true.
   */
  | "join"
  | "branch"
  | "repeat"
  | "other";

/** Where the action stands: still going, finished, failed, or waiting on a person. */
export type ActivityActionOutcome = "working" | "done" | "failed" | "waiting";

/**
 * One action, ready for a card. `target` is the name of what it acted on as
 * the event already carried it, or null when it named none (the client says
 * "the page" in its own words). `why` is a short human reason for a failure,
 * or null; never a result code.
 */
export type ActivityAction = {
  kind: ActivityActionKind;
  target: string | null;
  outcome: ActivityActionOutcome;
  why: string | null;
  /**
   * Present, and true, for a step a test run of the Flow ran (a build's dry
   * run, or a part of the Flow run again): the card names the action and adds
   * that it was a test. Its steps read "Test run · ×" before (t174-w85 D4).
   */
  testing?: true;
  /**
   * Present, and true, on a result check that could not confirm the result
   * answers the request, or could not check it at all. `outcome` stays
   * `failed`, fail-closed, for a client that does not read this; a client that
   * does says "not confirmed", never "didn't pass": an unverified run that met
   * its task read "Check result · Didn't pass" in red (t174-w85 D1).
   */
  unconfirmed?: true;
};

/**
 * The fields of one activity event the classifier reads. A client passes the
 * `server.activity` payload as it arrived; fields it does not have may be left
 * out.
 */
export type ActivityActionEvent = {
  phase: string;
  /** Core's status sentence; read only to tell a result check's verdicts apart (`./result-check-labels.ts`). */
  label?: string | undefined;
  detail?: {
    kind: string;
    title: string;
    text?: string | undefined;
    status?: string | undefined;
    ref?: string | undefined;
    /**
     * On the ask row that settles a wait on the person: how it ended
     * (`answered`, `allowed`, `waited_out`, `declined`, `timed_out`,
     * `cancelled`). The card
     * is marked from this row alone.
     */
    resolution?: string | undefined;
  } | undefined;
  step?: { nodeId?: string | undefined; label?: string | undefined } | undefined;
};

/**
 * The generic verbs an id, a label or a result code can name. Each belongs to
 * one kind; the activity wording (`programs/automation-studio/runtime/activity/wording`)
 * says each in a person's words.
 */
export type ActivityActionVerb =
  | "navigate"
  | "back"
  | "click"
  | "type"
  | "search"
  | "clear"
  | "select"
  | "check"
  | "upload"
  | "read"
  | "list"
  | "describe"
  | "detect"
  | "look"
  | "scroll"
  | "wait"
  | "assert"
  | "download"
  | "key"
  | "dialog"
  | "tab";
