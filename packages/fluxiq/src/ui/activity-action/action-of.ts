import { activityActionFailureReason } from "./failure-reason.ts";
import { activityActionRecordOf } from "./record.ts";
import { activityActionReplayFailing } from "./replay-failing.ts";
import { activityActionTested } from "./tested.ts";
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
  ["core.completion_check", "ready_check"],
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
/**
 * The title a result check's rows carry ("Result check":
 * `programs/automation-studio/runtime/result-verification/verify.ts`; an older
 * Core titled its start "Result check started"). It checks what a run left; it
 * runs nothing, so it is no test run.
 */
const RESULT_CHECK_TITLE = /^Result check\b/u;
/**
 * The title a build's completion check's rows carry
 * (`programs/automation-studio/runtime/activity/observer.ts`). It checks the
 * plan before the test runs it, so it is no test run: it read "Test run ·
 * Passed" before the test had run a step (t193 1002-M, C9).
 */
const COMPLETION_CHECK_TITLE = /^Completion check\b/u;
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
  if (detail.kind === "check" && RESULT_CHECK_TITLE.test(detail.title)) return "result_check";
  if (core === "ready_check" || (detail.kind === "check" && COMPLETION_CHECK_TITLE.test(detail.title))) return "ready_check";
  if (detail.kind === "check" || event.phase === "verifying" || core === "test") return "test";
  if (core) return core;
  const control = node ? CORE_NODE_KINDS.get(node) : undefined;
  if (control) return control;
  const verb = kindOfId(node)
    ?? (ref && !ref.startsWith(CORE_PREFIX) ? kindOfId(ref) : undefined)
    ?? (event.step?.label ? kindOfWords(wordsOf(event.step.label), true) : undefined)
    ?? kindOfCode(code)
    ?? kindOfTitle(detail.title);
  if (verb) return verb;
  // A tool call, or a step the executor ran, is an action even when nothing
  // names its verb. A note or a bare status step ("Build started") is not.
  if (detail.kind === "tool" || (detail.kind === "step" && (event.step !== undefined || ref !== undefined))) return "other";
  return null;
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

function targetOf(event: ActivityActionEvent, detail: Detail, kind: ActivityActionKind): string | null {
  for (const candidate of [QUOTED.exec(detail.title)?.[1], event.step?.label]) {
    const name = candidate?.replace(/\s+/gu, " ").trim();
    if (name && (!ID_SHAPED.test(name) || (kind === "navigate" && ADDRESS_PATH.test(name)))) return name;
  }
  // A look that names no control is named by the words it looks for, kept in
  // their quotes so the card never reads them as a control's name.
  const sought = kind === "look" ? SAID.exec(detail.title)?.[1]?.replace(/\s+/gu, " ").trim() : undefined;
  return sought && !ID_SHAPED.test(sought) ? `"${sought}"` : null;
}

/**
 * The action one activity event shows, for a chat card: its kind (which picks
 * the icon and the card's name), the name of what it acted on, where it
 * stands, and why it failed. Null for a thought (the decision's reason, and
 * "Deciding the next step"), a pure status change, and every row that is not
 * an action ("Run started", "Build finished").
 *
 * The kind is decided in this order: Core's own tool ids (`core.flow_draft`
 * is an edit to the Flow; a dry run is a test run, a completion check a
 * ready check); a wait on a person (a check they have to complete, else a
 * permission); the `repairing` phase; a result code that says the page needs
 * a person, or a permission; a result check's rows (`result_check`, checking
 * what a run left); a completion check's rows (`ready_check`, checking the
 * plan before the test runs it); any other check row or a `verifying` row (a dry run's steps); and
 * otherwise the verb named by the node id's last segment, the tool id, the
 * step's label, the result code's action word, or the title Core already said
 * it in. Generic verbs only; see `./verb.ts`.
 *
 * An ask is waiting until the row that settles it says how it ended
 * (`detail.resolution`): done when it was answered, allowed or waited out,
 * failed when it was declined, nobody answered, or the work stopped first. That row is the only one
 * read for it; a later event of the same work never settles a wait.
 *
 * `target` is the name Core quoted in the title, else the step's label, else
 * for a look the words it looked for, in straight quotes, else null; never an
 * id, though a navigate's address path ("/help/index.html") is not one. A replay code that says the step held (`./replay-failing.ts`: replayed,
 * verified, present, remembered) is done, not failed, and so is one for a step
 * the test passes over (its record's `Excused`); `tested` says which in words
 * (`./tested.ts`), for each of them but a step done again. `why` is set only for a failure: a settled ask's
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
  const outcome = outcomeOf(event, detail, record.resultCode, record.excused);
  const why = outcome !== "failed" ? null
    : detail.kind === "ask" ? declinedWhy(kind, detail.resolution)
      : record.resultCode ? activityActionFailureReason(record.resultCode, record.reason) : null;
  // A test's step has the test's own kind; what it did is the verb of its title.
  const tested = outcome === "done" && record.resultCode ? activityActionTested(record.resultCode, { excused: record.excused, kind: kindOfTitle(detail.title) }) : null;
  return { kind, target: targetOf(event, detail, kind), outcome, why, ...(tested ? { tested } : {}) };
}
