// What one of Core's raw activity events says, in a person's words.
//
// Core speaks in its own terms: "Using core.run_node: web.action.rejected.
// not_at_start_location". Those ids are exact and belong in the record (the
// event's `detail.ref` and `detail.text`, for a row a person chooses to
// expand), never in the words a person reads at a glance. This module is
// the only place that turns an event into those words, so the overlay, the
// chat header and the chat rows cannot drift apart:
//
// - a tool is named by what it does to the page ("Looking for the list of
//   items"); a model decision, while it is being made, by what it is for
//   ("Deciding the next step"), and once made by the model's own stated reason
//   for it; the completion check by what it checks;
// - a tool's result code becomes a short outcome ("done", "couldn't find it
//   on the page", "that didn't work: the page took too long"); a call FluxIQ
//   declined to send (`web.action.rejected.*`) is "not tried", with why when
//   the row says (`not-tried.ts`), never a page miss; a decision Core declined
//   before doing it (a call or a whole Flow refused as a repeat, an edit
//   refused) is "not done", with Core's reason. None of them says what comes
//   next: "that didn't work, trying another way" was said before the same
//   Flow was sent again unchanged, and before the build ended (lane C,
//   run-mv0fuotv-805294d7, defect 3);
// - Core's own sentence is kept when it is already human ("Running step 2 of
//   5: Open search", "Saved 12 records"), and replaced by the phase's plain
//   wording when it carries an id.
//
// Core names what a tool call does from the call's own input (its
// `detail.title`, e.g. "Clicking “Get a free quote”"), marks a dry run's calls
// `verifying` ("Trying the Flow from the start: …") and its own bookkeeping
// calls as `note` rows. Those words are used as they come, ahead of any table
// here; the rules above are the fallback for a Core that sends only the tool
// id, and "Thinking about the next step" for one that sends no detail.
//
// Pure: no browser API, no clock. Nothing here matches `RAW_ID`.

import type { ClientGatewayActivity, ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { activityActionFailureReason, activityActionOf } from "../activity-action/index.ts";
import { declinedSubmission } from "./declined-submission.ts";
import { notTriedOutcome } from "./not-tried.ts";

export type ActivityWording = {
  /** What is being done: "Opening the page", "Thinking about the next step". */
  action: string;
  /** How it ended, when the event says it ended: "done", "couldn't find it on the page". Null while under way. */
  outcome: string | null;
  /** The one line a person reads: the action, and its outcome after a dash when there is one. */
  sentence: string;
  /**
   * True for Core's own bookkeeping calls (the opening look, a dry run putting
   * the page back): accurate, but not a step of the person's work, so a
   * reader may leave them out of what it shows.
   */
  internal: boolean;
};

/** A dotted id such as `core.run_node` or `web.action.succeeded`: never shown to a person. */
const RAW_ID = /\b[a-z]+\.[a-z_]+/iu;

const DRAFT_TOOL_ID = "core.flow_draft";
/** Core's row while a decision is being made (`runtime/activity/observer.ts`). */
const DECIDING = "Deciding the next step";
const RUN_NODE_TOOL_ID = "core.run_node";

/** Tools whose purpose alone names them. */
const TOOL_ACTIONS: Readonly<Record<string, string>> = Object.freeze({
  // Core's own heading for an edit; the panel says it the same way (D12 of the t342 round 2 UI review).
  [DRAFT_TOOL_ID]: "Changing the Flow",
  "web.detect_repeating_structure": "Looking for the list of items"
});

const OUTCOME_DONE = "done";
const OUTCOME_NOT_FOUND = "couldn't find it on the page";
/** A call that did not work. It never says what FluxIQ does next, which this row cannot know. */
const OUTCOME_FAILED = "that didn't work";
/** A result code for a step that ran and whose effect did not show (Core's `failure-reason.ts`). */
const RAN_UNSEEN = /(?:^|[._])(?:output_not_observed|not_observed|state_mismatch)$/u;
/** A sentence that already says it was not done ("Not done: saving the Flow's steps"). */
const SAID_NOT_DONE = /^not done\b/iu;
const OUTCOME_NOT_REPEATED = "it didn't work the same way again";
/**
 * A Flow sent back because a step answering a popup pressed its offer rather
 * than its way out (t423, Core's `flow-bootstrap/script-statements/way-out-steps.ts`),
 * read from the refusal's result code, which may carry a digest after a colon.
 */
const WAY_OUT_REFUSED = /^candidate\.way_out_refused(?::|$)/u;
const OUTCOME_WAY_OUT = "a step would accept the offer instead of closing it, so it was sent back";
/**
 * Core's newer words for a passed completion check: what the Flow does matches
 * the request, and the test from the start that follows can still refuse it.
 * Said without Core's own "plan" (D3 of the t174 UI review of
 * run-musp8nz1-dbd3905a: "the plan checks out, it still has to run cleanly").
 */
const OUTCOME_PLAN_OK = "looks right, testing it next";

/** What a page step does, told by words in its node id or label. First match wins. */
const NODE_ACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/nav|open|visit|goto|go[-_ ]to|load|back/iu, "Opening the page"],
  [/click|press|tap|select|choose/iu, "Clicking on the page"],
  [/extract|read|list|collect|scrape|record|rows/iu, "Reading the list"],
  [/type|fill|enter|input|search|write/iu, "Typing into the page"],
  [/scroll/iu, "Scrolling the page"],
  [/wait/iu, "Waiting for the page"],
  [/snap|inspect|look|observe|screenshot|view/iu, "Looking at the page"]
];

/** What a page step did, told by the family of its result code, when nothing else says. */
const RESULT_ACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^web\.inspect\./u, "Looking at the page"],
  [/^web\.(extract|records?)\./u, "Reading the list"],
  [/^core\.replay\./u, "Trying the Flow out"]
];

/** The plain wording of each phase, for an event whose own sentence carries an id. */
const PHASE_ACTIONS: Readonly<Record<ClientGatewayActivityPhase, string>> = Object.freeze({
  thinking: "Thinking about the next step",
  exploring: "Working on the page",
  building: "Building the Flow",
  running: "Running the Flow",
  // A run held between steps (Take over, or a pause): Core's own label says which.
  paused: "Paused",
  extracting: "Saving what was found",
  verifying: "Checking the Flow does what you asked",
  repairing: "Fixing a step that didn't work",
  waiting_permission: "Waiting for your answer",
  done: "Done",
  failed: "That didn't work"
});

/** The words a person reads for `event`. */
export function activityWording(event: ClientGatewayActivity): ActivityWording {
  const [action, outcome] = wordsOf(event);
  return { action, outcome, sentence: outcome ? `${action} — ${outcome}` : action, internal: isBookkeeping(event) };
}

/** A tool call Core made for itself, which it sends as a `note` row with the tool's id. */
function isBookkeeping(event: ClientGatewayActivity): boolean {
  return event.detail?.kind === "note" && Boolean(event.detail.ref) && (event.phase === "exploring" || event.phase === "verifying");
}

function wordsOf(event: ClientGatewayActivity): readonly [string, string | null] {
  const detail = event.detail;
  const toolId = toolIdOf(event);
  if (toolId !== undefined) {
    const code = resultCodeOf(event);
    // A row's status says whether the call ended; only an older Core's bare "Using X: code" sentence is read for it.
    const ended = detail?.status ? detail.status !== "started" : code !== undefined;
    const action = toolAction(toolId, event, code);
    // A call FluxIQ declined to send was not tried, whatever its code's last words say of the page (R2-U-6).
    const declined = code === undefined ? undefined : notTriedOutcome(code, detail?.text, action);
    return [action, ended ? testedOutcome(event, code) ?? declined ?? wayOutOutcome(code) ?? refusedOutcome(event, action) ?? submissionOutcome(event, action) ?? toolOutcome(event, detail?.status, code) : null];
  }
  if (event.phase === "thinking" || detail?.kind === "thought") return [thoughtAction(event), null];
  if (detail?.title === "Completion check" || /^(Checking the proposed (result|Flow)|The proposed (result|Flow))/u.test(event.label)) {
    const status = detail?.status ?? (/passed|checks out/u.test(event.label) ? "succeeded" : /refused|sent back/u.test(event.label) ? "failed" : "started");
    // Core's newer sentence says only the plan passed; the older "passed its check" is kept as it was read.
    const passed = /checks out/u.test(event.label) ? OUTCOME_PLAN_OK : OUTCOME_DONE;
    return [PHASE_ACTIONS.verifying, status === "succeeded" ? passed : status === "failed" ? "not yet, trying another way" : null];
  }
  if (event.step && event.phase === "running") {
    const said = humanOr(event.label, "");
    // Core's sentence names the step's action ("Running step 2 of 7: Clicking “Search”"); without one, it is rebuilt from `step`.
    return [/^Running step \d+( of \d+)?: \S/u.test(said) ? said : runStepSentence(event.step), null];
  }
  return [humanOr(event.label, PHASE_ACTIONS[event.phase] ?? PHASE_ACTIONS.exploring), null];
}

/** The tool an event reports on: its `detail.ref` for a tool row, or the id in Core's "Using X" sentence. */
function toolIdOf(event: ClientGatewayActivity): string | undefined {
  if (event.detail?.kind === "tool" || isBookkeeping(event)) return event.detail?.ref || /^Using (\S+?):?(?:\s|$)/u.exec(event.detail?.title ?? "")?.[1] || "";
  if (event.detail) return undefined;
  if (/^Amending the draft Flow/u.test(event.label)) return DRAFT_TOOL_ID;
  return /^Using (\S+?):?(?:\s|$)/u.exec(event.label)?.[1];
}

/** The result code, from `detail.text` ("Result: X") or from Core's sentence ("Using T: X"). */
function resultCodeOf(event: ClientGatewayActivity): string | undefined {
  const fromText = /^Result:\s*([^\s·]+)/u.exec(event.detail?.text ?? "")?.[1];
  if (fromText) return fromText;
  const fromLabel = /^Using \S+?:\s*(\S+)\s*$/u.exec(event.label)?.[1];
  return fromLabel && fromLabel !== "done" && fromLabel !== "failed" ? fromLabel : undefined;
}

/**
 * A decision in words: the model's stated reason once it is made (a thought
 * row's text), else Core's own sentence ("Deciding the next step", "The AI
 * model provider did not answer"), else, for a Core that sends no detail,
 * "Thinking about the next step". Every decision read "Thinking about the next
 * step", before and after the model answered (t193).
 */
function thoughtAction(event: ClientGatewayActivity): string {
  const detail = event.detail;
  if (detail === undefined) return PHASE_ACTIONS.thinking;
  const reason = detail.kind === "thought" ? humanOr(detail.text ?? "", "") : "";
  return reason || humanOr(event.label, humanOr(detail.title, DECIDING));
}

function toolAction(toolId: string, event: ClientGatewayActivity, code: string | undefined): string {
  if (toolId === DRAFT_TOOL_ID) return TOOL_ACTIONS[DRAFT_TOOL_ID]!;
  // Core's own words for the call first: they name its target ("Looking for
  // the repeating list around “Products”"), which a table here cannot.
  const said = coreAction(event);
  if (said) return said;
  const named = TOOL_ACTIONS[toolId];
  if (named) return named;
  if (toolId !== RUN_NODE_TOOL_ID) return "Working on the page";
  const label = event.step?.label?.trim();
  // The leading word of an id or label is usually its verb ("click.search-result",
  // "Open the shop"), so it is read before the whole text.
  const hints = [label, event.step?.nodeId]
    .filter((hint): hint is string => typeof hint === "string" && hint.length > 0)
    .flatMap((hint) => [hint.split(/[\s._-]/u)[0] ?? "", hint]);
  for (const hint of hints) {
    for (const [pattern, action] of NODE_ACTIONS) {
      if (!pattern.test(hint)) continue;
      const name = label ? plainName(label) : "";
      if (!name || RAW_ID.test(name)) return action;
      if (action === "Clicking on the page") return /^(click|press|tap)\b/iu.test(name) ? capitalised(name) : `Clicking “${name}”`;
      // A typing step names its field as a click names its control (D5 of the
      // run-musp8nz1-dbd3905a review: a typing step said nothing of where).
      if (action === "Typing into the page") return /^(type|fill|enter|input|write)\b/iu.test(name) ? capitalised(name) : `Typing into “${name}”`;
      return action;
    }
  }
  if (code) for (const [pattern, action] of RESULT_ACTIONS) if (pattern.test(code)) return action;
  return "Trying a step on the page";
}

/**
 * The action as Core already said it for a person: the status sentence up to
 * its outcome (a dry run's "Trying the Flow from the start: clicking “X”"),
 * else the row's title. Nothing when Core sent only an id ("Using X").
 */
function coreAction(event: ClientGatewayActivity): string | undefined {
  for (const text of [event.label.split(" — ")[0] ?? "", event.detail?.title ?? ""]) {
    const said = humanOr(text, "");
    if (said && !/^Using\b/u.test(said)) return said;
  }
  return undefined;
}

/** A name as it is put in quotes: one space between words, and no quotes of its own. */
function plainName(text: string): string {
  return text.replace(/\s+/gu, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim();
}

/** A test's step the test did not simply do again: checked, already done, or one the Flow passes over (`Excused` in its record). */
const TESTED_CODE = /^core\.replay\.(verified|present|remembered)$/u;
const EXCUSED = /(?:^|·\s*)Excused: \S/u;

/**
 * What a test of the Flow did with a step it did not simply do again, as
 * Core's sentence says it after its dash ("checked, not pressed", "already
 * done on the site", "skipped: not there, optional"), which are the words its
 * card says (Core's `activityActionTested`). Nothing for any other step, or
 * for an older Core whose sentence said no more than "done". The overlay read
 * "done" and "that didn't work, trying another way" for these while the card
 * said otherwise (t193 1002-M, `run-murzln6g-11debe1d`, C10).
 */
function testedOutcome(event: ClientGatewayActivity, code: string | undefined): string | undefined {
  if (!code || !(TESTED_CODE.test(code) || (code.startsWith("core.replay.") && EXCUSED.test(event.detail?.text ?? "")))) return undefined;
  const said = humanOr(event.label.split(" — ").slice(1).join(" — "), "");
  return said && said !== OUTCOME_DONE ? said : undefined;
}

/**
 * A decision Core declined before doing it, in Core's words as its card says
 * them (`activityActionOf`'s `refused`): "not done: the same Flow was already
 * sent exactly like this and was not accepted", or the reason alone after a
 * sentence that already says "Not done". Undefined for anything else, and for
 * an edit some of which landed.
 */
function refusedOutcome(event: ClientGatewayActivity, action: string): string | undefined {
  const refused = activityActionOf(event)?.refused;
  if (refused === undefined || !refused.all) return undefined;
  const because = refused.because.trim();
  if (SAID_NOT_DONE.test(action)) return because || undefined;
  return because ? `not done: ${because}` : "not done";
}

/**
 * A submission of steps Core refused without saying so in words
 * (`declined-submission.ts`): "not done: ...", as its card says it, never
 * "done" or "that didn't work" (t649).
 */
function submissionOutcome(event: ClientGatewayActivity, action: string): string | undefined {
  const because = declinedSubmission(event);
  if (because === undefined) return undefined;
  return SAID_NOT_DONE.test(action) ? because : `not done: ${because}`;
}

/** The outcome of a Flow sent back for pressing a popup's offer, said without its code; undefined for any other code. */
function wayOutOutcome(code: string | undefined): string | undefined {
  return code !== undefined && WAY_OUT_REFUSED.test(code) ? OUTCOME_WAY_OUT : undefined;
}

function toolOutcome(event: ClientGatewayActivity, status: "started" | "succeeded" | "failed" | undefined, code: string | undefined): string {
  if (code) {
    // A step that ran and whose effect did not show: Core's card words, worded
    // for the step's kind ("it ran, but the text there didn't change the way
    // it should have" for a clear or a typing step). `web.validation.output_not_observed` matched nothing
    // here and read "done" (R4a attempt 2, `run-mv2pgqkj-f3552c70`, moment 12).
    if (RAN_UNSEEN.test(code)) {
      const why = activityActionOf(event)?.why ?? activityActionFailureReason(code);
      return why ? `${OUTCOME_FAILED}: ${why}` : OUTCOME_FAILED;
    }
    // Core's reason for the code, as the step's card says it, so the status line
    // and the card cannot disagree (t174-lead-1003); the old words for a code
    // Core has none for.
    if (/^core\.replay\.(changed|unreproducible)/u.test(code)) return activityActionFailureReason(code) ?? OUTCOME_NOT_REPEATED;
    // A control looked up by what FluxIQ saved of it and not found that way:
    // Core's words say so, never that it was missing from the page, as the
    // quantity box stood in plain sight (R4a, `run-mv2nlh9l-52e476da`, moment 06).
    if (/not_found|no_match/u.test(code)) return activityActionFailureReason(code) ?? OUTCOME_NOT_FOUND;
    if (/unobserved|missing|not_visible|absent|not_detected|none_found|empty/u.test(code)) return OUTCOME_NOT_FOUND;
    if (/rejected|failed|error|timeout|timed_out|refused|denied|invalid|blocked|aborted|rate_limited|throttled/u.test(code)) {
      const why = activityActionFailureReason(code);
      return why ? `${OUTCOME_FAILED}: ${why}` : OUTCOME_FAILED;
    }
    return OUTCOME_DONE;
  }
  return status === "failed" ? OUTCOME_FAILED : OUTCOME_DONE;
}

/** "Running step N of M: label", said as Core says it; the label only when it is an authored one, not a node id. */
function runStepSentence(step: NonNullable<ClientGatewayActivity["step"]>): string {
  const index = Math.floor(step.index);
  const counted = Number.isFinite(step.count) && step.count >= 1 && index <= step.count ? `step ${index} of ${Math.floor(step.count)}` : `step ${index}`;
  const label = step.label?.trim();
  return `Running ${counted}${label && !RAW_ID.test(label) ? `: ${label}` : ""}`;
}

function humanOr(sentence: string, fallback: string): string {
  const collapsed = sentence.replace(/\s+/gu, " ").trim();
  return collapsed && !RAW_ID.test(collapsed) ? collapsed : fallback;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
