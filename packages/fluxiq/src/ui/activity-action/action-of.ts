import { activityActionCheckWhy } from "./check-why.ts";
import { activityActionFailureReason } from "./failure-reason.ts";
import { activityActionRecordOf } from "./record.ts";
import { activityActionRefusal } from "./refusal.ts";
import { activityActionReplayFailing } from "./replay-failing.ts";
import { activityActionTested } from "./tested.ts";
import { ACTIVITY_RESULT_CHECK_LABELS } from "./result-check-labels.ts";
import { activityActionResultCheckRow } from "./result-check-row.ts";
import type { ActivityAction, ActivityActionEvent, ActivityActionKind, ActivityActionOutcome, ActivityActionVerb } from "./types.ts";
import { activityActionVerb } from "./verb.ts";
import { ACTIVITY_ACTION_VERB_NAMES } from "./verb-names.ts";

type Detail = NonNullable<ActivityActionEvent["detail"]>;
/** What a card is: its kind, and the verb that named it when one did. */
type Act = { kind: ActivityActionKind; verb?: ActivityActionVerb };

const CORE_PREFIX = "core.";
/**
 * Core's own tool ids whose kind the id alone decides. `core.run_node` is not
 * here: what it does is the verb of the node it runs.
 */
const CORE_TOOL_KINDS: ReadonlyMap<string, ActivityActionKind> = new Map<string, ActivityActionKind>([
  ["core.flow_draft", "draft"],
  ["core.dry_run", "test"],
  ["core.dry_run.page", "test"],
  ["core.completion_check", "test"],
  ["core.observe", "look"],
  // Reading how a step is used: a look at what Core holds rather than an
  // action on the page.
  ["core.describe_nodes", "look"],
  // Reading an earlier result again, which is no look at the page: one that
  // found nothing read "Look · Didn't work: it wasn't on the page" (t194).
  ["core.recall_result", "recall"],
  ["core.state_snapshot", "look"],
  ["core.state_diff", "look"],
  // A candidate build's own tools (t373): writing the Flow's steps is a change
  // to the Flow, and its trial is a test run of the whole Flow. Before they had
  // rows, the chat showed no card for either (t366).
  ["core.submit_candidate", "draft"],
  ["core.test_candidate", "test"]
]);
/** A candidate build's submission of its whole Flow (t373). */
const SUBMIT_CANDIDATE = "core.submit_candidate";
/**
 * The name of a submission refused as a repeat: the same Flow sent again
 * unchanged. It read "Change the Flow · run the step again" (lane C,
 * `run-mv0fuotv-805294d7`, defect 4).
 */
const RESENT_NAME = "Send the Flow again";

/**
 * Core's own control nodes, by definition id, and the kind each one is. They
 * act on the Flow's paths, never on the page, and their ids name no verb a
 * card could read: a merge step's card read "Action · the page" (U-A2,
 * `run-muq6lqnw-fdfa7aac`). Matched by whole id rather than by word, because
 * "switch" or "each" in a step's own label ("Switch my pickup store") is no
 * control step at all.
 */
const CORE_NODE_KINDS: ReadonlyMap<string, ActivityActionKind> = new Map<string, ActivityActionKind>([
  ["builtin.control.merge", "join"],
  ["builtin.control.branch", "branch"],
  ["builtin.control.switch", "branch"],
  ["builtin.control.parallel", "branch"],
  ["builtin.control.for-each", "repeat"],
  ["builtin.control.loop", "repeat"],
  // The do-while loop's head (read-list design, section 4): it numbers and bounds a loop's passes.
  ["builtin.control.repeat", "repeat"]
]);

/** A result code that says the action did not happen (`programs/automation-studio/runtime/activity/observer.ts` reads codes the same way). */
const FAILING = /reject|fail|error|timeout|timed_out|refused|denied|invalid|blocked|not_found|unobserved|not_observed|state_mismatch/u;
/** A result code that says the page needs a person before the work can go on. */
const PERSON_CODE = /(?:^|[._-])(intervention|check_required|human_check)(?:[._-]|$)/u;
/** A result code that says the work needs a person's permission. */
const PERMISSION_CODE = /(?:^|[._-])permission(?:[._-]|$)/u;
/** A waiting row's title that names a check the person has to complete. */
const PERSON_TITLE = /\bcheck\b/iu;
/** The name Core quotes in a title: Clicking “Get a free quote”. */
const QUOTED = /“([^”]+)”/u;
/** Words a look searches for, which Core says in straight quotes: Looking for "USB-C hub" on the page. */
const SAID = /"([^"]+)"/u;
/** A result check's verdicts that are neither a pass nor a failure: not confirmed, or not checked. */
const NOT_CONFIRMED: ReadonlySet<string> = new Set([ACTIVITY_RESULT_CHECK_LABELS.unconfirmed, ACTIVITY_RESULT_CHECK_LABELS.unchecked]);
/**
 * What a look's title says it looked over, at or for ("Looking over the whole
 * page", "Looking for the repeating list on the page": the wording in
 * `programs/automation-studio/runtime/activity/wording/action.ts`).
 */
const LOOKED_AT = /^Looking (?:over|at|for) (.+)$/u;
/** A look at the bare page names nothing a person could tell apart from any other. */
const BARE_PAGE = /^the page$/iu;
/**
 * A page's address path as the navigate wording names it ("/ip/napkins", or
 * "…/ip/napkins" cut at the front): a dot in it ("/help/index.html") is not an id.
 */
const ADDRESS_PATH = /^…?\/\S*$/u;
/**
 * A site's name as the navigate wording names it ("amazon.com",
 * "shop.example.co.uk"): dotted labels ending in a top-level domain of
 * letters. A dotted id ("web.output.browser-navigate") does not end so.
 */
const SITE_NAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/iu;
/** The navigate wording's name for an address it does not show (`programs/automation-studio/runtime/activity/wording/action.ts`). */
const START_PAGE = /^Opening (the (?:start|home) page)$/u;
/** Something shaped like a dotted id ("web.output.dom-click"), which a card never shows. */
const ID_SHAPED = /[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*/u;
/** How a wait on the person ended, as the ask row that settles it says (`ClientGatewayActivity.detail.resolution`). */
const RESOLVED_DONE: ReadonlySet<string> = new Set(["answered", "allowed", "waited_out"]);
const RESOLVED_FAILED: ReadonlySet<string> = new Set(["declined", "timed_out", "cancelled"]);
/** The row a pass of a repeated test step was on, which Core names last in its title (`runtime/activity/wording/tool-call.ts`). */
const FOR_ROW = /\sfor “([^”]+)”$/u;
/** A look at one element's details, as the wording says it (`runtime/activity/wording/action.ts`). */
const DETAILS_OF = /^Reading the details of “([^”]+)”$/u;
/** A look for the repeating list around one element. */
const LIST_AROUND = /^Looking for the repeating list around “([^”]+)”$/u;
/** A look that found a list the page names (a heading, an accessible name): R2-U-9, `run-muwansvz-a2b4a987`. */
const LIST_NAMED = /^Looking for the list “([^”]+)”$/u;
/**
 * A look-up of how a kind of step is used, as the wording says it
 * (`runtime/activity/wording/core-tool.ts`): "Looking up how to read a list".
 * It named the node, "Look · Extract list" (R2-U-4, `run-muwansvz-a2b4a987`).
 */
const LOOKED_UP = /^Looking up (how to [^“”"]+)$/u;
/** The most of a page's own name a look's card shows. */
const MAX_SHORT_WORDS = 4;
const MAX_SHORT_CHARS = 32;
/** The status sentence of a run's saved records (`runtime/executor/node-execution.ts`): "Saved 20 records". */
const SAVED_RECORDS = /^Saved (\d{1,9}) records?$/u;
const RECORDS_SAVED_TITLE = "Records saved";

const counted = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * What a finished action came to (`ActivityAction.result`), when its row says:
 * an edit's `Changed` words, a list read's rows and pages, or the records a run
 * saved. Undefined for anything else, and for anything not finished.
 */
function resultOf(event: ActivityActionEvent, detail: Detail, kind: ActivityActionKind, outcome: ActivityActionOutcome, record: ReturnType<typeof activityActionRecordOf>): string | undefined {
  if (outcome !== "done") return undefined;
  // Core's own account of how its call ended, in words (`./record.ts`, `Said`).
  if (record.said) return record.said;
  if (kind === "draft") return record.changed;
  if (kind === "read" && record.rows !== undefined) {
    return record.pages !== undefined ? `${counted(record.rows, "row")} from ${counted(record.pages, "page")}` : counted(record.rows, "row");
  }
  const saved = detail.title === RECORDS_SAVED_TITLE ? SAVED_RECORDS.exec(event.label?.trim() ?? "")?.[1] : undefined;
  return saved === undefined ? undefined : `${counted(Number(saved), "record")} saved`;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
}

/** A word and the forms it may stand for once an "-ing" or "-ed" ending is taken off ("typing" -> "type", "scrolled" -> "scroll"). */
function formsOf(word: string): string[] {
  const forms = [word];
  const ending = word.length > 5 && word.endsWith("ing") ? 3 : word.length > 4 && word.endsWith("ed") ? 2 : 0;
  if (ending === 0) return forms;
  const stem = word.slice(0, -ending);
  forms.push(stem, `${stem}e`);
  if (stem.length > 2 && stem.at(-1) === stem.at(-2)) forms.push(stem.slice(0, -1));
  return forms;
}

function actOfWords(words: readonly string[], inflected: boolean): Act | undefined {
  for (const word of words) {
    for (const form of inflected ? formsOf(word) : [word]) {
      const verb = activityActionVerb(form);
      if (verb) return verb;
    }
  }
  return undefined;
}

/** The verb an id's last segment names: "web.output.dom-click" is `dom`, `click`. */
function actOfId(id: string | undefined): Act | undefined {
  return id ? actOfWords(wordsOf(id.split(".").at(-1) ?? ""), false) : undefined;
}

/** A result code's action word, past its namespace: "example.opened" is `opened`. */
function actOfCode(code: string | undefined): Act | undefined {
  return code ? actOfWords(wordsOf(code.split(".").slice(1).join(" ")), true) : undefined;
}

/** A title already said in words: its first word as the wording opens a sentence ("Checking the page"), else any verb in it. */
function actOfTitle(title: string): Act | undefined {
  const words = wordsOf(title);
  const opening = words[0] ? activityActionVerb(words[0], "gerund") : undefined;
  return opening ?? actOfWords(words, true);
}

function kindOfTitle(title: string): ActivityActionKind | undefined {
  return actOfTitle(title)?.kind;
}

function actOf(event: ActivityActionEvent, detail: Detail, code: string | undefined, node: string | undefined): Act | null {
  const ref = detail.ref;
  const core = ref ? CORE_TOOL_KINDS.get(ref) : undefined;
  if (core === "draft") return { kind: "draft" };
  // A wait on the person before the repair phase: the row that settles one is
  // said in the phase the work returns to, which may be `repairing`.
  if (event.phase === "waiting_permission" || detail.kind === "ask") {
    return { kind: PERSON_TITLE.test(detail.title) || (code !== undefined && PERSON_CODE.test(code)) ? "person_check" : "permission" };
  }
  if (event.phase === "repairing") return { kind: "repair" };
  if (code !== undefined && PERSON_CODE.test(code)) return { kind: "person_check" };
  if (code !== undefined && PERMISSION_CODE.test(code)) return { kind: "permission" };
  if (activityActionResultCheckRow(detail)) return { kind: "result_check" };
  // A test run's step is named by its action, as a build's own step is; one
  // that names no action stays a test run.
  if (testStep(event, detail, core)) return actionActOf(event, detail, code, node) ?? { kind: "test" };
  if (detail.kind === "check" || event.phase === "verifying" || core === "test") return { kind: "test" };
  if (core) return { kind: core };
  const act = actionActOf(event, detail, code, node);
  if (act) return act;
  // A tool call, or a step the executor ran, is an action even when nothing
  // names its verb. A note or a bare status step ("Build started") is not.
  if (detail.kind === "tool" || (detail.kind === "step" && (event.step !== undefined || ref !== undefined))) return { kind: "other" };
  return null;
}

/** A step a test run of the Flow ran: a tool row of the `verifying` phase that is no Core tool of its own. */
function testStep(event: ActivityActionEvent, detail: Detail, core: ActivityActionKind | undefined): boolean {
  return event.phase === "verifying" && detail.kind === "tool" && core === undefined;
}

/** The action a control node, a node id, a tool id, a label, a result code or a title names, and its verb; undefined when none names one. */
function actionActOf(event: ActivityActionEvent, detail: Detail, code: string | undefined, node: string | undefined): Act | undefined {
  const ref = detail.ref;
  const control = node ? CORE_NODE_KINDS.get(node) : undefined;
  if (control) return { kind: control };
  return actOfId(node)
    ?? (ref && !ref.startsWith(CORE_PREFIX) ? actOfId(ref) : undefined)
    ?? (event.step?.label ? actOfWords(wordsOf(event.step.label), true) : undefined)
    ?? actOfCode(code)
    ?? actOfTitle(detail.title);
}

/**
 * The kind a failure's reason is worded for: the card's own, but for a run's
 * "Recovering from a failed step" row (`repairing`), the kind of the step that
 * failed, which its node and title still name. That row settles a failed step
 * and is what the page's overlay reads why from, and a clear step the site
 * set back read "it ran, but the page didn't change the way it should have"
 * there rather than a box's words (R4a attempt 2, `run-mv2pgqkj-f3552c70`,
 * moment 12: `web.validation.output_not_observed` on `web.output.dom-clear`).
 */
function reasonKind(event: ActivityActionEvent, detail: Detail, kind: ActivityActionKind, record: ReturnType<typeof activityActionRecordOf>): ActivityActionKind {
  if (kind !== "repair") return kind;
  return actionActOf(event, detail, record.resultCode, record.node)?.kind ?? kind;
}

/** A failing code, unless it is a replay's for a step the test passes over (`excused`), which did not stand in the way. */
function failingCode(code: string, excused: string | undefined): boolean {
  return code.startsWith("core.replay.") ? activityActionReplayFailing(code) && excused === undefined : FAILING.test(code);
}

function outcomeOf(event: ActivityActionEvent, detail: Detail, code: string | undefined, excused: string | undefined): ActivityActionOutcome {
  if (detail.kind === "ask") {
    // Only the row that settles the wait says it is over; nothing after it is read for that.
    if (detail.resolution !== undefined && RESOLVED_DONE.has(detail.resolution)) return "done";
    if (detail.resolution !== undefined && RESOLVED_FAILED.has(detail.resolution)) return "failed";
    return detail.status === "failed" ? "failed" : "waiting";
  }
  if (event.phase === "waiting_permission") return "waiting";
  if (detail.status === "failed") return "failed";
  if (code !== undefined && failingCode(code, excused)) return "failed";
  if (code !== undefined && (PERSON_CODE.test(code) || PERMISSION_CODE.test(code))) return "waiting";
  if (detail.status === "succeeded") return "done";
  return "working";
}

/** Why a wait on the person ended without the work going on, in a few plain words. */
function declinedWhy(kind: ActivityActionKind, resolution: string | undefined): string | null {
  if (resolution === "timed_out") return "nobody answered in time";
  if (resolution === "cancelled") return "the work stopped first";
  if (resolution === "declined") return kind === "person_check" ? "you pressed Stop" : "you said no";
  return null;
}

/** `text` with its spaces made single, unless it is empty or shaped like an id. */
function plain(text: string | undefined): string | undefined {
  const words = text?.replace(/\s+/gu, " ").trim();
  return words && !ID_SHAPED.test(words) ? words : undefined;
}

/**
 * A name a page gave, shortened for a card: whole when it is short, else its
 * first words up to `MAX_SHORT_WORDS` and `MAX_SHORT_CHARS`, never cut inside
 * a word, with "…" after. A name Core already cut ("…Earbuds, Hybr…") loses its
 * cut last word. Words with no letter or digit ("ⓘ") are left out. Undefined
 * when nothing is left.
 */
function shortName(text: string): { words: string; whole: boolean } | undefined {
  const cut = text.endsWith("…");
  const words = (cut ? text.slice(0, -1) : text).split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (cut) words.pop();
  const kept: string[] = [];
  for (const word of words) {
    if (kept.length >= MAX_SHORT_WORDS || [...kept, word].join(" ").length > MAX_SHORT_CHARS) break;
    kept.push(word);
  }
  if (!kept.length) return undefined;
  const whole = !cut && kept.length === words.length;
  const said = kept.join(" ").replace(/[,;:.]+$/u, "");
  return { words: whole ? said : `${said}…`, whole };
}

/**
 * What a look at one thing on the page looked for, in plain words, or
 * undefined for any other look. A look's card named the page's own label as
 * its target, cut mid-word -- "Look · Sponsored ⓘ ... Earbuds, Hybr...",
 * "Look · Brightaisle Plus" (U-2, `run-muw60j7c-bb7c9a62`):
 *
 * - an element's details (`Reading the details of “Brightaisle Plus”`) are the
 *   details of that label: `the "Brightaisle Plus" label`, short;
 * - the repeating list around an element (`Looking for the repeating list
 *   around “Sponsored”`) is that list: `the list around "Sponsored"` when the
 *   element's name is short and whole, else the repeating list on the page;
 * - a list the page names, once the detection found it (`Looking for the list
 *   “Search results”`): `the "Search results" list` when the name is short and
 *   whole, else the repeating list on the page (R2-U-9);
 * - a look-up of how a kind of step is used (`Looking up how to read a list`)
 *   is what it looks up: `how to read a list`.
 */
function lookedFor(title: string): string | undefined {
  const lookedUp = LOOKED_UP.exec(title)?.[1];
  if (lookedUp !== undefined) return lookedUp;
  const details = DETAILS_OF.exec(title)?.[1];
  if (details !== undefined) {
    const name = shortName(details);
    return name ? `the "${name.words}" label` : "a control's details";
  }
  const listed = LIST_NAMED.exec(title)?.[1];
  if (listed !== undefined) {
    const name = shortName(listed);
    return name?.whole ? `the "${name.words}" list` : "the repeating list on the page";
  }
  const around = LIST_AROUND.exec(title)?.[1];
  if (around === undefined) return undefined;
  const anchor = shortName(around);
  return anchor?.whole ? `the list around "${anchor.words}"` : "the repeating list on the page";
}

/**
 * What a card acted on, and the row it was on inside a repeat. The row is the
 * step's own (`step.row`, Core's plain name of it), else, for a repeated test
 * step, the one Core names after the step's own words ("Clicking “Confirm”
 * for “Jonas Weber”"): three passes read as three identical "Click · Confirm"
 * cards (U1, `run-muw6144a-e56f945d`), and a run's passes still did (lane D,
 * `run-mv0fuual-f9e6f089`, finding 2).
 */
function targetOf(event: ActivityActionEvent, detail: Detail, kind: ActivityActionKind, testing: boolean): string | null {
  const own = plain(event.step?.row);
  const forRow = testing || own !== undefined ? FOR_ROW.exec(detail.title) : null;
  const row = own ?? (forRow ? plain(forRow[1]) : undefined);
  if (row) {
    const step = targetOfStep(event, forRow ? { ...detail, title: detail.title.slice(0, forRow.index) } : detail, kind, testing);
    return step ? `${step} · ${row}` : row;
  }
  return targetOfStep(event, detail, kind, testing);
}

/** What a card acted on, without the row it was on. */
function targetOfStep(event: ActivityActionEvent, detail: Detail, kind: ActivityActionKind, testing: boolean): string | null {
  if (kind === "look") {
    const looked = lookedFor(detail.title.trim());
    if (looked) return looked;
  }
  let name: string | undefined;
  for (const candidate of [QUOTED.exec(detail.title)?.[1], event.step?.label]) {
    const words = candidate?.replace(/\s+/gu, " ").trim();
    if (words && (!ID_SHAPED.test(words) || (kind === "navigate" && (ADDRESS_PATH.test(words) || SITE_NAME.test(words))))) {
      name = words;
      break;
    }
  }
  // Words typed or looked for, kept in their straight quotes so the card never
  // reads them as a control's name. A test run's typing step names what it
  // typed, then where: no decision above it says the words, and its field
  // alone was a search box's placeholder, "Autumn Mega Sale: up to 70…", never
  // "Voltbay USB-C hub" (t174-w85 D4). A build's typing step names the field
  // only; the decision above its card already says the words.
  const said = kind === "look" || (kind === "type" && testing) ? plain(SAID.exec(detail.title)?.[1]) : undefined;
  if (said && kind === "type") return name ? `"${said}" into ${name}` : `"${said}"`;
  if (name) return name;
  if (said) return `"${said}"`;
  // A navigate to the start page names it unquoted, so it is not read as a control (t174-w116 D2).
  if (kind === "navigate") return START_PAGE.exec(detail.title.trim())?.[1] ?? null;
  // A look that names neither a control nor words is named by what its title
  // says it looked over ("the whole page"): "Look · Done" said nothing (D5).
  const looked = kind === "look" ? plain(LOOKED_AT.exec(detail.title.trim())?.[1]) : undefined;
  return looked && !BARE_PAGE.test(looked) ? looked : null;
}

/**
 * The action one activity event shows, for a chat card: its kind (which picks
 * the icon and the card's name), the name of what it acted on, where it
 * stands, and why it failed. Null for a thought (the decision's reason, and
 * "Deciding the next step"), a pure status change, and every row that is not
 * an action ("Run started", "Build finished").
 *
 * The kind is decided in this order: Core's own tool ids (`core.flow_draft`
 * is an edit to the Flow; a dry run or a completion check is a test run); a
 * wait on a person (a check they have to complete, else a permission); the
 * `repairing` phase; a result code that says the page needs a person, or a
 * permission; a result check's rows (`result_check`, checking what a run
 * left); a test run's step (a `verifying` tool row that is no Core tool), by
 * the action it names as below and marked `testing`, else a test run; any
 * other check row or `verifying` row; and otherwise the verb named by the
 * node id's last segment, the tool id, the step's label, the result code's
 * action word, or the title Core already said it in. Generic verbs only; see
 * `./verb.ts`.
 *
 * An ask is waiting until the row that settles it says how it ended
 * (`detail.resolution`): done when it was answered, allowed or waited out,
 * failed when it was declined, nobody answered, or the work stopped first. That row is the only one
 * read for it; a later event of the same work never settles a wait.
 *
 * `target` is the name Core quoted in the title, else the step's label; a
 * test run's typing step puts the words it typed first, in straight quotes ('"3" into
 * Quantity'); a look that names no control is named by the words it looked
 * for, in straight quotes, else by what its title says it looked over ("the
 * whole page", never the bare page); a look at one element is named by what it
 * looked for, short (`the "Brightaisle Plus" label`, `the list around
 * "Sponsored"`), never by the page's label alone; a look-up of how a kind of
 * step is used by what it looks up (`how to read a list`), never by a node's
 * name; a pass of a repeated test
 * step adds the row it was on (`Confirm · Jonas Weber`); else null. Never an id, though a
 * navigate's address path ("/help/index.html") is not one. A result check
 * that could not confirm the result, or could not check it, is `unconfirmed`,
 * read from Core's status sentence (`./result-check-labels.ts`). A replay code that says the step held (`./replay-failing.ts`: replayed,
 * verified, present, remembered) is done, not failed, and so is one for a step
 * the test passes over (its record's `Excused`); `tested` says which in words
 * (`./tested.ts`), for each of them but a step done again. `why` is set only for a failure: a settled ask's
 * resolution in words ("you pressed Stop", "nobody answered in time"); for a
 * result check that refuted the result, how many rows came back or would be
 * stored and why they did not pass, read from the check's text
 * (`./check-why.ts`: "82 rows would be stored, but ..."), and null for one
 * that could not confirm it; or else the refusal's own reason or the result
 * code's last words, said for the card's kind (`./failure-reason.ts`: a list
 * read in a list's words), and never is the code or the reason.
 *
 * A decision Core declined before doing it -- a call refused as a repeat, an
 * edit to the draft refused in whole or in part -- is `refused`, read from its
 * record's code (`./refusal.ts`): failed when nothing of it was done, with
 * Core's plain reason as `why`, and done when part of an edit was. An edit
 * that asked for a step to run again is named that ("run the step again"); a
 * candidate build's whole Flow sent again unchanged is "Send the Flow again",
 * with no target, and its reason says the same Flow was sent before.
 *
 * `name` is set when the verb that named the action is narrower than its kind
 * (`./verb-names.ts`): "Choose" for an option chosen, "Tick" for a box ticked,
 * "Next page" for a list's next page; a target that would only repeat it is
 * left out. A step inside a repeat adds the row it was on, its own `step.row`
 * or a test's title's ("Confirm · Jonas Weber").
 *
 * `result` says what a finished action came to, where its row says it: an
 * edit's changes in Core's words, a list read's rows and pages, a run's saved
 * records (`./types.ts`).
 */
export function activityActionOf(event: ActivityActionEvent): ActivityAction | null {
  const detail = event.detail;
  if (!detail || detail.kind === "thought") return null;
  const record = activityActionRecordOf(detail.text);
  const found = actOf(event, detail, record.resultCode, record.node);
  if (!found) return null;
  // A "check" node that set an option chosen from several -- a colour swatch,
  // a size chip -- is said "Choosing" by the wording, which knows its element:
  // its card read "Tick · Space Grey" (R4a, `run-mv2nlh9l-52e476da`, moment 04).
  const act = found.verb === "check" && actOfTitle(detail.title)?.verb === "select" ? { ...found, verb: "select" as const } : found;
  const kind = act.kind;
  // A candidate build's submission sends the whole Flow: one refused as a repeat is that Flow sent again unchanged.
  const submitted = detail.ref === SUBMIT_CANDIDATE;
  const refusal = detail.kind === "tool" ? activityActionRefusal(record, submitted) : null;
  const outcome = refusal ? (refusal.all ? "failed" : "done") : outcomeOf(event, detail, record.resultCode, record.excused);
  const unconfirmed = kind === "result_check" && outcome === "failed" && event.label !== undefined && NOT_CONFIRMED.has(event.label.trim());
  const why = outcome !== "failed" || unconfirmed ? null
    : refusal ? refusal.because
      : record.said ? record.said
      : detail.kind === "ask" ? declinedWhy(kind, detail.resolution)
        : kind === "result_check" ? activityActionCheckWhy(detail.text)
          : record.resultCode ? activityActionFailureReason(record.resultCode, record.reason, reasonKind(event, detail, kind, record)) : null;
  const testing = kind !== "test" && testStep(event, detail, detail.ref ? CORE_TOOL_KINDS.get(detail.ref) : undefined);
  // What a test did with the step, when it did not simply do it again: a test
  // step is named by its action (`testing`), and one that names none by the verb of its title.
  const tested = outcome === "done" && record.resultCode && !refusal ? activityActionTested(record.resultCode, { excused: record.excused, kind: kind === "test" ? kindOfTitle(detail.title) : kind }) : null;
  const result = resultOf(event, detail, kind, outcome, record);
  const resent = kind === "draft" && submitted && refusal?.rerun === true;
  const name = resent ? RESENT_NAME : act.verb === undefined ? undefined : ACTIVITY_ACTION_VERB_NAMES[act.verb];
  const target = resent ? null : kind === "draft" && refusal?.rerun ? "run the step again" : targetOf(event, detail, kind, testing);
  return {
    kind,
    ...(name === undefined ? {} : { name }),
    // A target that only says the name again says nothing: "Next page · Next page".
    target: name !== undefined && target !== null && target.toLowerCase() === name.toLowerCase() ? null : target,
    outcome,
    why,
    ...(testing ? { testing: true as const } : {}),
    ...(unconfirmed ? { unconfirmed: true as const } : {}),
    ...(tested ? { tested } : {}),
    ...(refusal ? { refused: { all: refusal.all, because: refusal.because } } : {}),
    ...(result ? { result } : {})
  };
}
