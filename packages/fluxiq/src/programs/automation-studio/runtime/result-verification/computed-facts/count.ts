// The stored row count against the count the build declared (`answer.rows`,
// framework plan K2).
//
// **What it compares.** A part's declared answer may say how many rows it asks
// for (`../contracts/requested-output.ts`, from the task spec's `answer.rows`):
// exactly `count`, or at least `atLeast` and at most `atMost`. The rows stored
// are the one record set that can hold the answer -- the run's sets less those
// Core sets aside as working rows (`../read-account/working-sets.ts`) -- or, for
// a build test, the one dataset its Flow would store, where the test made its
// answer as a run's end makes it (`removed` present, `../build-test/stores.ts`).
// One part owing records with rows, one answer: anything else says nothing,
// since Core cannot tell which rows answer which part.
//
// **Too many is Core's to say.** Rows stored past the count asked, or past the
// most asked, are more than the request asks for, whatever they are.
//
// **Too few only where Core's record shows the rows were there.** A short answer
// is honest where the list held no more matching rows, so it fails only where
// Core's own record shows rows that passed every condition and never reached
// the answer:
//
// - a limit cut them (`processing.cut`, or a build test's `removed.cut`): the
//   answer's limit applies after its conditions and its dedupe, so every row it
//   cut passed them; or
// - the read that collected the answer has no condition, the answer's own
//   processing filtered nothing, and the read stopped short of a list that went
//   on: its own page bound stopped it (`../read-account/stop.ts`), a cap cut it
//   (`truncated`), or the page named a next part by a control (`listContinues`
//   `next_page` or `load_more`). With nothing to refuse them, the rows it never
//   read would have been kept. A list that grows as it is revealed (a feed) is
//   not counted: going on past an end the page marks is not rows missing
//   (`../read-account/list-continues.ts`, t741 D).
//
// Otherwise a short answer is no fact, and the judge is asked as before. A
// fact that holds is said to the judge as settled.

import type {
  AutomationStudioResultComputedDefect,
  AutomationStudioResultComputedFact,
  AutomationStudioResultComputedFactsInput,
  AutomationStudioResultReadAccount,
  AutomationStudioResultRequestedRows,
  AutomationStudioRunResultSummary
} from "../contracts/index.ts";
import { automationStudioResultReadStop, automationStudioResultReadWorkingSets } from "../read-account/index.ts";
import { automationStudioResultRequestedOutputOwed } from "../requested-output/index.ts";

/** The ways a list says it goes on that name its next part (header): a feed's growth is not one. */
const NAMED_NEXT: ReadonlySet<string> = new Set(["next_page", "load_more"]);

/** The answer's stored rows, by the dataset that holds them, and whether Core's record shows rows that passed every condition left out of it (header). */
type Answer = { dataset: string; rows: number; lostMatching: boolean };

/** The stored row count against the count the build declared (`answer.rows`, K2). None where Core cannot compute it. */
export function automationStudioResultCountFact(input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  const owed = automationStudioResultRequestedOutputOwed(input.summary, input.requestedOutput);
  const declared = owed?.parts.length === 1 ? owed.parts[0]! : undefined;
  if (!declared?.rows) return [];
  const asked = declared.rows;
  const answer = answerOf(input.summary);
  if (!answer) return [];
  const words = partWords(input, declared.part);
  const stored = `${answer.rows} ${answer.rows === 1 ? "row" : "rows"}`;
  const over = asked.count !== undefined ? answer.rows > asked.count : asked.atMost !== undefined && answer.rows > asked.atMost;
  const under = asked.count !== undefined ? answer.rows < asked.count : asked.atLeast !== undefined && answer.rows < asked.atLeast;
  const owedBy = `part ${declared.part} asks for ${askedText(asked)}`;
  if (over) return [failed(`The answer ${answer.dataset} stores ${stored}, and ${owedBy}: more rows than asked.`, { kind: "kept_not_asked", row: answer.dataset, value: stored, requestWords: words })];
  if (under && !answer.lostMatching) return [];
  if (under) {
    const why = "Core's record shows rows that passed every condition left out of it: cut by a limit, or never read on a list that went on with nothing to refuse them.";
    return [failed(`The answer ${answer.dataset} stores ${stored}, and ${owedBy}: fewer rows than asked. ${why}`, { kind: "asked_missing", row: answer.dataset, value: stored, requestWords: words })];
  }
  return [{ kind: "count", status: "holds", said: `Settled by Core: the answer ${answer.dataset} stores ${stored}, and ${owedBy}. Do not decide the number of rows again.` }];
}

function failed(said: string, defect: AutomationStudioResultComputedDefect): AutomationStudioResultComputedFact {
  return { kind: "count", status: "fails", said, defects: [defect] };
}

/** The one answer the summary holds (header), or undefined where it holds none or more than one, or cannot say how many rows. */
function answerOf(summary: AutomationStudioRunResultSummary): Answer | undefined {
  if (summary.buildTest) {
    const stores = summary.buildTest.stores ?? [];
    const store = stores.length === 1 ? stores[0]! : undefined;
    if (!store?.removed) return undefined;
    return { dataset: store.dataset, rows: store.answer.rows, lostMatching: store.removed.cut > 0 };
  }
  if (summary.recordSetCount !== summary.recordSets.length) return undefined;
  const working = automationStudioResultReadWorkingSets(summary);
  const sets = summary.recordSets.filter((set) => !working.has(set.datasetId));
  if (sets.length !== 1) return undefined;
  const set = sets[0]!;
  const processing = set.processing;
  const collectors = new Set((processing?.passes ?? []).map((pass) => pass.node));
  const reads = (summary.reads ?? []).filter((read) => collectors.has(read.nodeId));
  const unrefused = processing !== undefined && processing.filteredOut === 0 && !processing.conditions?.length && reads.length > 0 && reads.length === collectors.size;
  const readOn = unrefused && reads.every((read) => !read.conditions?.length && read.unfiltered !== true) && reads.some(wentOn);
  return { dataset: set.datasetId, rows: set.recordCount, lostMatching: (processing?.cut ?? 0) > 0 || readOn };
}

/** Whether the read stopped short of a list that went on, as its own record says (header). */
function wentOn(read: AutomationStudioResultReadAccount): boolean {
  return read.truncated || automationStudioResultReadStop(read) === "page_bound" || (read.listContinues !== undefined && NAMED_NEXT.has(read.listContinues.kind));
}

/** The part's own words, as the checklist quotes them; else the request's first instruction, the clause every row falls under. */
function partWords(input: AutomationStudioResultComputedFactsInput, part: string): string {
  const quoted = input.summary.taskChecklist?.asked.find((entry) => entry.part === part)?.words.trim();
  if (quoted && input.requestText.includes(quoted)) return quoted;
  const first = input.instructions.find((instruction) => instruction.body.trim() || instruction.title.trim());
  return first ? first.body.trim() || first.title.trim() : input.requestText.trim();
}

function askedText(asked: AutomationStudioResultRequestedRows): string {
  if (asked.count !== undefined) return `exactly ${asked.count}`;
  if (asked.atLeast !== undefined && asked.atMost !== undefined) return `from ${asked.atLeast} to ${asked.atMost}`;
  return asked.atLeast !== undefined ? `at least ${asked.atLeast}` : `at most ${asked.atMost}`;
}
