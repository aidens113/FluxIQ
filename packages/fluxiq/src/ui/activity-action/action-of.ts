import { activityActionFailureReason } from "./failure-reason.ts";
import { activityActionRecordOf } from "./record.ts";
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
  ["core.state_snapshot", "look"],
  ["core.state_diff", "look"]
]);

const REPLAY_PREFIX = "core.replay.";
const REPLAYED = "core.replay.replayed";
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
/** Something shaped like a dotted id ("web.output.dom-click"), which a card never shows. */
const ID_SHAPED = /[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*/u;

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
  if (event.phase === "repairing") return "repair";
  if (event.phase === "waiting_permission" || detail.kind === "ask") {
    return PERSON_TITLE.test(detail.title) || (code !== undefined && PERSON_CODE.test(code)) ? "person_check" : "permission";
  }
  if (code !== undefined && PERSON_CODE.test(code)) return "person_check";
  if (code !== undefined && PERMISSION_CODE.test(code)) return "permission";
  if (detail.kind === "check" || event.phase === "verifying" || core === "test") return "test";
  if (core) return core;
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

function failingCode(code: string): boolean {
  return code.startsWith(REPLAY_PREFIX) ? code !== REPLAYED : FAILING.test(code);
}

function outcomeOf(event: ActivityActionEvent, detail: Detail, code: string | undefined): ActivityActionOutcome {
  if (event.phase === "waiting_permission") return "waiting";
  if (detail.status === "failed") return "failed";
  if (code !== undefined && failingCode(code)) return "failed";
  if (code !== undefined && (PERSON_CODE.test(code) || PERMISSION_CODE.test(code))) return "waiting";
  if (detail.status === "succeeded") return "done";
  return "working";
}

function targetOf(event: ActivityActionEvent, detail: Detail): string | null {
  for (const candidate of [QUOTED.exec(detail.title)?.[1], event.step?.label]) {
    const name = candidate?.replace(/\s+/gu, " ").trim();
    if (name && !ID_SHAPED.test(name)) return name;
  }
  return null;
}

/**
 * The action one activity event shows, for a chat card: its kind (which picks
 * the icon and the card's name), the name of what it acted on, where it
 * stands, and why it failed. Null for a thought (the decision's reason, and
 * "Deciding the next step"), a pure status change, and every row that is not
 * an action ("Run started", "Build finished").
 *
 * The kind is decided in this order: Core's own tool ids (`core.flow_draft`
 * is an edit to the Flow; a dry run or a completion check is a test run); the
 * `repairing` phase; a wait on a person (a check they have to complete, else a
 * permission); a result code that says the page needs a person, or a
 * permission; a check row or a `verifying` row (a dry run's steps); and
 * otherwise the verb named by the node id's last segment, the tool id, the
 * step's label, the result code's action word, or the title Core already said
 * it in. Generic verbs only; see `./verb.ts`.
 *
 * `target` is the name Core quoted in the title, else the step's label, else
 * null; never an id. `why` is set only for a failure, from the result code's
 * last words (`./failure-reason.ts`), and never is the code.
 */
export function activityActionOf(event: ActivityActionEvent): ActivityAction | null {
  const detail = event.detail;
  if (!detail || detail.kind === "thought") return null;
  const record = activityActionRecordOf(detail.text);
  const kind = kindOf(event, detail, record.resultCode, record.node);
  if (!kind) return null;
  const outcome = outcomeOf(event, detail, record.resultCode);
  const why = outcome === "failed" && record.resultCode ? activityActionFailureReason(record.resultCode) : null;
  return { kind, target: targetOf(event, detail), outcome, why };
}
