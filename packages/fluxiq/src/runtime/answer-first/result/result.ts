// The writer of what an attempt got: the shared result record (D8, D9), and the one
// place an attempt's rows, acts and words become it.
//
// **It always gives a record.** A budget-out with nothing must still end properly (the
// user's hard rule, 2026-11-03), so anything the contract refuses leaves the record
// smaller and honest rather than failing it, down to an empty `partial`. The only
// thing it cannot make up is the attempt it belongs to: an attempt id the contract
// refuses is a programming error, and throws.
//
// **The kind claims only what was checked.** A result that is not `confirmed` is `rows`
// or `partial`, whatever it holds, because the contract lets a budget-out be nothing
// else (`checkAutomationStudioTaskAttemptResult`) and the best result so far is what a
// budget-out carries: so the best so far is always one it can carry, and an act or an
// answer nobody confirmed is never called done. It keeps them all on the record.
//
// **`answerText` is the model's words, and is screened here** (`task-result.ts`: that
// is the writer's job). A label of `confirmed` or `refuted` with no check is written
// `unverified`: `checkedWhat` and `missingWhat` are a person's words, and any the
// contract refuses are left off.

import {
  AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS,
  AUTOMATION_STUDIO_TASK_RESULT_LABELS as LABELS,
  type AutomationStudioAttemptAct,
  type AutomationStudioTaskResult,
  type AutomationStudioTaskResultFrom,
  type AutomationStudioTaskResultKind,
  type AutomationStudioTaskResultLabel,
  type AutomationStudioTaskResultRows
} from "@fluxiq/contracts/automation";
import { automationStudioFlowLessScreenedWords } from "../../result-verification/index.ts";
import { automationStudioAnswerFirstCarriedActs } from "./carried-acts.ts";
import { AutomationStudioAnswerFirstEndingError } from "./ending-error.ts";
import { automationStudioAnswerFirstPreview } from "./preview.ts";
import { automationStudioAnswerFirstResultProbe } from "./probe.ts";

export type AutomationStudioAnswerFirstResultInput = {
  attemptId: string;
  label: AutomationStudioTaskResultLabel;
  timesChecked: number;
  rows?: AutomationStudioTaskResultRows | undefined;
  acts: readonly AutomationStudioAttemptAct[];
  answerText?: string | undefined;
  checkedWhat?: string | undefined;
  missingWhat?: string | undefined;
  /** Rows the act record held done and the attempt left alone. Said on the result only when at least one. */
  skippedAsDone?: number | undefined;
  from?: readonly AutomationStudioTaskResultFrom[] | undefined;
};

/** An attempt in this lane reaches its result by exploring: a later attempt's paths are the Second Attempt lane's. */
const SOURCE = "exploration";
const NOTHING_CONFIRMED = "It ended without a confirmed result.";
const ANSWER_WITHHELD = "The model's answer is left out because it looked like it held a credential.";

export function automationStudioAnswerFirstResult(input: AutomationStudioAnswerFirstResultInput): AutomationStudioTaskResult {
  const timesChecked = Number.isSafeInteger(input.timesChecked) && input.timesChecked >= 0 ? input.timesChecked : 0;
  const label = honestLabel(input.label, timesChecked);
  const rows = input.rows ? automationStudioAnswerFirstPreview(input.rows) : { notes: [] as string[] };
  const acts = automationStudioAnswerFirstCarriedActs(input.acts);
  const answer = screenedAnswer(input.answerText);
  const kind = chosenKind({ label, rows: rows.rows, acts: acts.acts, answerGiven: answer.text !== undefined });
  const notes = [...rows.notes, ...acts.notes, ...answer.notes];
  const words = wordsOrNothing("checkedWhat", input.checkedWhat);
  const missing = missingWords(kind, input.missingWhat, notes);
  const from = (input.from ?? []).filter((one) => automationStudioAnswerFirstResultProbe({ from: [one] }).ok).slice(0, LIMITS.listMaxEntries);
  const skipped = input.skippedAsDone !== undefined && automationStudioAnswerFirstResultProbe({ skippedAsDone: input.skippedAsDone }).ok ? input.skippedAsDone : undefined;
  const whole = automationStudioAnswerFirstResultProbe({
    attemptId: input.attemptId,
    kind,
    label,
    timesChecked,
    source: SOURCE,
    acts: acts.acts,
    ...(rows.rows ? { rows: rows.rows } : {}),
    ...(answer.text !== undefined ? { answerText: { text: answer.text, author: "model" } } : {}),
    ...(words !== undefined ? { checkedWhat: words } : {}),
    ...(missing !== undefined ? { missingWhat: missing } : {}),
    ...(skipped !== undefined ? { skippedAsDone: skipped } : {}),
    ...(from.length ? { from } : {})
  });
  if (whole.ok) return whole.result;
  // The honest smaller record: what it did on the site and how often it was checked, claiming nothing.
  const smaller = automationStudioAnswerFirstResultProbe({ attemptId: input.attemptId, timesChecked, source: SOURCE, acts: acts.acts, missingWhat: NOTHING_CONFIRMED, ...(skipped !== undefined ? { skippedAsDone: skipped } : {}) });
  if (smaller.ok) return smaller.result;
  throw new AutomationStudioAnswerFirstEndingError(smaller.issues);
}

function honestLabel(label: AutomationStudioTaskResultLabel, timesChecked: number): AutomationStudioTaskResultLabel {
  if (!LABELS.includes(label)) return "unverified";
  return label !== "unverified" && timesChecked === 0 ? "unverified" : label;
}

/** Rows that hold something, then what it did, then what it said, then an empty set it was confirmed on (a request whose right answer is nothing). */
function chosenKind(got: { label: AutomationStudioTaskResultLabel; rows: AutomationStudioTaskResultRows | undefined; acts: readonly AutomationStudioAttemptAct[]; answerGiven: boolean }): AutomationStudioTaskResultKind {
  if (got.rows && got.rows.totalRows > 0) return "rows";
  if (got.label !== "confirmed") return "partial";
  if (got.acts.some((act) => act.state === "landed" || act.state === "may_have_landed")) return "done_on_site";
  if (got.answerGiven) return "plain_answer";
  return got.rows ? "rows" : "partial";
}

function screenedAnswer(answerText: string | undefined): { text?: string; notes: string[] } {
  if (answerText === undefined || answerText.trim().length === 0) return { notes: [] };
  const screened = automationStudioFlowLessScreenedWords(answerText);
  if (screened.text === undefined) return { notes: screened.withheld ? [ANSWER_WITHHELD] : [] };
  const text = screened.text.length > LIMITS.answerMaxLength ? `${screened.text.slice(0, LIMITS.answerMaxLength - 1)}…` : screened.text;
  return { text, notes: [] };
}

function wordsOrNothing(field: "checkedWhat" | "missingWhat", words: string | undefined): string | undefined {
  return words !== undefined && automationStudioAnswerFirstResultProbe({ [field]: words }).ok ? words : undefined;
}

/** What is missing, with what the writer left out: a partial always says something, and a note is said on any kind. */
function missingWords(kind: AutomationStudioTaskResultKind, given: string | undefined, notes: readonly string[]): string | undefined {
  const words = wordsOrNothing("missingWhat", given) ?? (kind === "partial" ? NOTHING_CONFIRMED : undefined);
  const joined = [words, ...notes].filter((part): part is string => part !== undefined).join(" ");
  if (joined.length === 0) return undefined;
  return wordsOrNothing("missingWhat", joined) ?? words;
}
