import { activityActionFailureReason } from "./failure-reason.ts";
import { activityActionRecordOf } from "./record.ts";
import { activityActionReplayFailing } from "./replay-failing.ts";
import { ACTIVITY_RESULT_CHECK_LABELS } from "./result-check-labels.ts";
import { activityActionResultCheckRow } from "./result-check-row.ts";
import type { ActivityAction, ActivityActionEvent, ActivityActionKind, ActivityActionOutcome } from "./types.ts";
import { activityActionVerb } from "./verb.ts";

type Detail = NonNullable<ActivityActionEvent["detail"]>;

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
  // Reading how a step is used, and an earlier result again: looks at what
  // Core holds rather than actions on the page.
  ["core.describe_nodes", "look"],
  ["core.recall_result", "look"],
  ["core.state_snapshot", "look"],
  ["core.state_diff", "look"]
]);

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
  ["builtin.control.loop", "repeat"]
]);

/** A result code that says the action did not happen (`programs/automation-studio/runtime/activity/observer.ts` reads codes the same way). */
const FAILING = /reject|fail|error|timeout|timed_out|refused|denied|invalid|blocked|not_found|unobserved/u;
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
/** Something shaped like a dotted id ("web.output.dom-click"), which a card never shows. */
const ID_SHAPED = /[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*/u;
/** How a wait on the person ended, as the ask row that settles it says (`ClientGatewayActivity.detail.resolution`). */
const RESOLVED_DONE: ReadonlySet<string> = new Set(["answered", "allowed", "waited_out"]);
const RESOLVED_FAILED: ReadonlySet<string> = new Set(["declined", "timed_out", "cancelled"]);

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

function kindOfWords(words: readonly string[], inflected: boolean): ActivityActionKind | undefined {
  for (const word of words) {
    for (const form of inflected ? formsOf(word) : [word]) {
      const verb = activityActionVerb(form);
      if (verb) return verb.kind;
    }
  }
  return undefined;
}

/** The verb an id's last segment names: "web.output.dom-click" is `dom`, `click`. */
function kindOfId(id: string | undefined): ActivityActionKind | undefined {
  return id ? kindOfWords(wordsOf(id.split(".").at(-1) ?? ""), false) : undefined;
}

/** A result code's action word, past its namespace: "example.opened" is `opened`. */
function kindOfCode(code: string | undefined): ActivityActionKind | undefined {
  return code ? kindOfWords(wordsOf(code.split(".").slice(1).join(" ")), true) : undefined;
}

/** A title already said in words: its first word as the wording opens a sentence ("Checking the page"), else any verb in it. */
function kindOfTitle(title: string): ActivityActionKind | undefined {
  const words = wordsOf(title);
  const opening = words[0] ? activityActionVerb(words[0], "gerund") : undefined;
  return opening?.kind ?? kindOfWords(words, true);
}

function kindOf(event: ActivityActionEvent, detail: Detail, code: string | undefined, node: string | undefined): ActivityActionKind | null {
  const ref = detail.ref;
  const core = ref ? CORE_TOOL_KINDS.get(ref) : undefined;
  if (core === "draft") return "draft";
  // A wait on the person before the repair phase: the row that settles one is
  // said in the phase the work returns to, which may be `repairing`.
  if (event.phase === "waiting_permission" || detail.kind === "ask") {
    return PERSON_TITLE.test(detail.title) || (code !== undefined && PERSON_CODE.test(code)) ? "person_check" : "permission";
  }
  if (event.phase === "repairing") return "repair";
  if (code !== undefined && PERSON_CODE.test(code)) return "person_check";
  if (code !== undefined && PERMISSION_CODE.test(code)) return "permission";
  if (activityActionResultCheckRow(detail)) return "result_check";
  // A test run's step is named by its action, as a build's own step is; one
  // that names no action stays a test run.
  if (testStep(event, detail, core)) return actionKindOf(event, detail, code, node) ?? "test";
  if (detail.kind === "check" || event.phase === "verifying" || core === "test") return "test";
  if (core) return core;
  const verb = actionKindOf(event, detail, code, node);
  if (verb) return verb;
  // A tool call, or a step the executor ran, is an action even when nothing
  // names its verb. A note or a bare status step ("Build started") is not.
  if (detail.kind === "tool" || (detail.kind === "step" && (event.step !== undefined || ref !== undefined))) return "other";
  return null;
}

/** A step a test run of the Flow ran: a tool row of the `verifying` phase that is no Core tool of its own. */
function testStep(event: ActivityActionEvent, detail: Detail, core: ActivityActionKind | undefined): boolean {
  return event.phase === "verifying" && detail.kind === "tool" && core === undefined;
}

/** The kind of action a control node, a node id, a tool id, a label, a result code or a title names; undefined when none names one. */
function actionKindOf(event: ActivityActionEvent, detail: Detail, code: string | undefined, node: string | undefined): ActivityActionKind | undefined {
  const ref = detail.ref;
  const control = node ? CORE_NODE_KINDS.get(node) : undefined;
  if (control) return control;
  return kindOfId(node)
    ?? (ref && !ref.startsWith(CORE_PREFIX) ? kindOfId(ref) : undefined)
    ?? (event.step?.label ? kindOfWords(wordsOf(event.step.label), true) : undefined)
    ?? kindOfCode(code)
    ?? kindOfTitle(detail.title);
}

function failingCode(code: string): boolean {
  return code.startsWith("core.replay.") ? activityActionReplayFailing(code) : FAILING.test(code);
}

function outcomeOf(event: ActivityActionEvent, detail: Detail, code: string | undefined): ActivityActionOutcome {
  if (detail.kind === "ask") {
    // Only the row that settles the wait says it is over; nothing after it is read for that.
    if (detail.resolution !== undefined && RESOLVED_DONE.has(detail.resolution)) return "done";
    if (detail.resolution !== undefined && RESOLVED_FAILED.has(detail.resolution)) return "failed";
    return detail.status === "failed" ? "failed" : "waiting";
  }
  if (event.phase === "waiting_permission") return "waiting";
  if (detail.status === "failed") return "failed";
  if (code !== undefined && failingCode(code)) return "failed";
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

function targetOf(event: ActivityActionEvent, detail: Detail, kind: ActivityActionKind, testing: boolean): string | null {
  let name: string | undefined;
  for (const candidate of [QUOTED.exec(detail.title)?.[1], event.step?.label]) {
    const words = candidate?.replace(/\s+/gu, " ").trim();
    if (words && (!ID_SHAPED.test(words) || (kind === "navigate" && ADDRESS_PATH.test(words)))) {
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
 * whole page", never the bare page); else null. Never an id, though a
 * navigate's address path ("/help/index.html") is not one. A result check
 * that could not confirm the result, or could not check it, is `unconfirmed`,
 * read from Core's status sentence (`./result-check-labels.ts`). A replay code that says the step held (`./replay-failing.ts`: replayed,
 * verified, present, remembered) is done, not failed. `why` is set only for a failure: a settled ask's
 * resolution in words ("you pressed Stop", "nobody answered in time"), or
 * else the refusal's own reason or the result code's last words
 * (`./failure-reason.ts`), and never is the code or the reason.
 */
export function activityActionOf(event: ActivityActionEvent): ActivityAction | null {
  const detail = event.detail;
  if (!detail || detail.kind === "thought") return null;
  const record = activityActionRecordOf(detail.text);
  const kind = kindOf(event, detail, record.resultCode, record.node);
  if (!kind) return null;
  const outcome = outcomeOf(event, detail, record.resultCode);
  const why = outcome !== "failed" ? null
    : detail.kind === "ask" ? declinedWhy(kind, detail.resolution)
      : record.resultCode ? activityActionFailureReason(record.resultCode, record.reason) : null;
  const testing = kind !== "test" && testStep(event, detail, detail.ref ? CORE_TOOL_KINDS.get(detail.ref) : undefined);
  const unconfirmed = kind === "result_check" && outcome === "failed" && event.label !== undefined && NOT_CONFIRMED.has(event.label.trim());
  return {
    kind,
    target: targetOf(event, detail, kind, testing),
    outcome,
    why,
    ...(testing ? { testing: true as const } : {}),
    ...(unconfirmed ? { unconfirmed: true as const } : {})
  };
}
