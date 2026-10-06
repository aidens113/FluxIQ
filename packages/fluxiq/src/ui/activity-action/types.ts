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
 * or null; never a result code. `tested` is set only on a step a test of the
 * Flow did not simply do again, and says what it did instead, in words a card
 * shows in place of "Done" ("Checked, not pressed", "Already done on the
 * site", "Skipped: not there, optional"; `./tested.ts`).
 */
export type ActivityAction = {
  kind: ActivityActionKind;
  target: string | null;
  outcome: ActivityActionOutcome;
  why: string | null;
  tested?: string;
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
  /**
   * Present on a decision Core declined before doing it (`./refusal.ts`): a
   * call refused as a repeat, or an edit to the draft Core refused. `all` is
   * true when nothing of it was done -- `outcome` stays `failed`, fail-closed,
   * and `why` is `because` for a client that does not read this -- and false
   * for an edit done in part, `outcome` `done`. `because` is Core's plain
   * reason. A client that reads it says "Not done", never "didn't work": a
   * refused edit was a header and prose with no card, ending "so this was not
   * done: <the model's own summary>" (t193 1003, C13/C14).
   */
  refused?: { all: boolean; because: string };
  /**
   * What a finished action came to, in a few plain words, present only when
   * Core knows it: how many rows a list read kept ("8 rows", "13 rows from 5
   * pages"), how many records a run saved ("20 records saved"), and what an
   * edit to the Flow changed ('removed "Add to cart"'). A client shows it
   * after "Done: ". Read from the row's record (`./record.ts`) or, for saved
   * records, Core's status sentence; never the model's own summary. Read cards
   * said a bare "Done" while the chat claimed "all search result pages" were
   * read (U-1, `run-muw60j7c-bb7c9a62`), and an edit that dropped the Add to
   * cart step read "Edit the Flow · Done" (U2, `run-muw60unq-591e23bd`).
   */
  result?: string;
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
