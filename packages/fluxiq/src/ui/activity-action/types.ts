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
  | "wait"
  | "person_check"
  | "permission"
  | "draft"
  | "test"
  | "repair"
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
};

/**
 * The fields of one activity event the classifier reads. A client passes the
 * `server.activity` payload as it arrived; fields it does not have may be left
 * out.
 */
export type ActivityActionEvent = {
  phase: string;
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
  | "detect"
  | "look"
  | "scroll"
  | "wait"
  | "assert"
  | "download"
  | "key"
  | "dialog"
  | "tab";
