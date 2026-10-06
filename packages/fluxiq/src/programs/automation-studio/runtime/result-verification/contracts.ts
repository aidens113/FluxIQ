// What a run's result is judged to be, and the bounded account of the result
// that the judgement is made from.
//
// FluxIQ had no check at all that a finished run answered what was asked. A run
// failed only when a step failed, so four separate live runs on 2026-09-17 each
// reported success while returning the wrong thing: a catalogue that returned
// none of its eight records, a catalogue whose every row was refused by record
// validation, a feed that returned ten of forty entries, and a request for two
// matching records that returned all two hundred and forty because the built
// Flow had no filtering step in it. Nothing failed, so nothing was reported.
// The test facility caught all four only because it holds a written answer key,
// and a person running their own automation has no answer key.
//
// The vocabulary here is deliberately about a *result*, not about a step. A
// record and a column are domain-neutral -- a row of values with named fields
// is what any medium's extraction produces -- and nothing in this file knows
// where the values came from.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
// The bounds live in `runtime/loop-limits/`, which neither this directory nor
// the harness owns. This file used to re-export them so a reader of the contract
// had them in hand, and no longer does: `result-summary.ts`, the module that
// applies every one of them, re-exports them instead, and the directory barrel
// publishes them from there, so nothing outside changes.
//
// It was moved because the re-export made a *contract* file reach a value out of
// another directory, and that directory's barrel also carries the evidence-loop
// budgets, which import values out of `runtime/llm/harness/`. So reading a byte
// bound pulled the whole LLM harness into the evaluation of every module that
// reads this contract -- and on 2026-09-26, with `runtime/llm` mid-rewrite, that
// made five of this directory's seven test suites fail to load at all on a
// `runtime/llm` module cycle none of them touch. A contract should cost its
// readers nothing to read.

/**
 * The verdict on whether a finished run's result answers the request.
 *
 * Three words, because two would force a model with no view to guess. `unsure`
 * exists so that "I cannot tell" is sayable, and it is emphatically not a pass:
 * `automationStudioResultVerificationAnswers` is the one reader of these
 * values, and only `answers` passes. What any other verdict does to the run
 * is `automationStudioResultVerificationFailsRun`'s to say: it fails the run
 * unless two checks of the same result did not settle it.
 */
export type AutomationStudioResultVerdict = "answers" | "does_not_answer" | "unsure";

/** How a verdict was reached. Recorded so a reader can tell a judgement from an unanswered question. */
export type AutomationStudioResultVerdictBasis =
  /** Core's own arithmetic over the result reached it; no model was asked. */
  | "core_observation"
  /** The model was asked and answered. */
  | "model"
  /** The model was asked and its answer carried no verdict. */
  | "model_silent"
  /** The call was made or attempted and did not come back usable. */
  | "model_unavailable"
  /**
   * The model judged the result not to answer, or could not tell, was asked
   * once more with the same evidence, and judged that it does -- or, on a
   * verification that confirms answers (the build-test judge's `confirmAnswer`),
   * judged that it answers and then that it does not. Two different answers to
   * one question settle nothing, so neither is taken over the other.
   */
  | "model_disagreed"
  /**
   * The model was asked twice with the same evidence and never judged that the
   * result answers, nor twice that it does not: `no` then `unknown`,
   * `unknown` then `no` or `unknown`, or a second call that gave no answer.
   * That is not proof the run failed.
   */
  | "model_unconfirmed";

/** One record set the run stored, as the verification reads it. */
export type AutomationStudioResultRecordSetSummary = {
  datasetId: string;
  label?: string;
  /** Rows stored. Zero is the finding that produced this module. */
  recordCount: number;
  /** Rows the record schema refused. Every row refused leaves `recordCount` zero. */
  refusedCount: number;
  /** True when the run returned more rows than the record output keeps. */
  truncated: boolean;
  /** The stored schema's field ids, in schema order, bounded by `maxColumns`. */
  columns: string[];
  /** True when the column list was cut. */
  columnsWithheld: boolean;
  /**
   * Stored rows Core read back for its own required-value check: at most
   * `maxRowsCheckedPerSet`, so fewer than `recordCount` on a large set, and 0
   * when the set's rows or its schema could not be read.
   */
  rowsChecked: number;
  /** Of `rowsChecked`, the rows carrying no value for a field the set's own schema declares required. */
  rowsMissingRequired: number;
  /** The required field ids some checked row lacked, in schema order, bounded by `maxColumns`. Ids, never values. */
  missingRequiredColumns: string[];
  /** A few stored rows, each value bounded. Absent when the set stored none. */
  sampleRows?: JsonObject[];
};

/**
 * One step of the Flow that produced the result, as the judgement reads it.
 *
 * It carried a node id and a definition id and nothing else, and that is not
 * enough to answer the question the judgement is asked. The instruction tells
 * the judge to answer `no` for "a Flow with no step that could have narrowed or
 * filtered what the request asked to narrow" -- and two definition ids apart, a
 * Flow that filters on the right field and a Flow that filters on the wrong one
 * are the same list of names. Five consecutive live runs were refuted with that
 * list in front of the judge, correctly, and with nothing in the refutation that
 * said which step was wrong.
 *
 * So the step now carries what the Flow authored it with, screened by
 * `repair-context/parameter-screen.ts` -- the same projection, the same screens
 * and the same dotted-path notation the *repair* has been shown since t139. A
 * judgement poorer than the repair that follows it is the parity gap this closes.
 */
export type AutomationStudioResultFlowStepSummary = {
  nodeId: string;
  definitionId: string;
  /** What the Flow calls this step, when it named one. Bounded. */
  label?: string;
  /**
   * The parameters the Flow authored this step with, screened: shapes and
   * names, never the person's data. Absent when the step has none, when no
   * declared-keys list was supplied, or when the summary's byte budget was
   * spent before this step was reached.
   */
  parameters?: JsonObject;
  /** The dotted paths whose authored value is not in `parameters` as the Flow wrote it. Never the values. */
  parametersWithheld?: string[];
};

/**
 * How one read of a list went, as the judgement and the repair read it.
 *
 * **Why it exists.** `run-munq5s8x-6d620cdf`: the Flow's extraction followed
 * five pages, filtered on four conditions and kept one row per link, and the
 * check refuted its eight rows -- correctly -- then advised "add a pagination
 * loop ... and a filter/dedup step", every part of which the step already had.
 * It had been told "8 records stored" and a list of definition ids; the step's
 * parameters had been cut to fit the call. The re-author was told the same. So
 * neither could see that the read already paged, nor which of its conditions
 * rejected the rows the request wanted.
 *
 * Two sources, joined by node id. The counts are the read's own account of
 * itself, which the run record already holds (`service/summaries/
 * extraction-summary.ts` admits it on the attempt as `metadata.extraction`);
 * the conditions, the paging and the dedupe key are what the Flow authored the
 * step with. Counts, closed words, column ids and the model's own condition
 * wording -- no locator, and no page value but a condition's `leftOutOnlyByThis` row
 * labels with the value it tested on each, and the value its own read found,
 * each screened.
 */
export type AutomationStudioResultReadAccount = {
  nodeId: string;
  definitionId: string;
  /** Pages the read covered, the first included. */
  pagesRead: number;
  /** The most pages (or loads) the step was authored to read, when it pages and says. */
  pageLimit?: number;
  /** Why paging stopped: the read's own closed word (`page_limit`, `control_absent`, `rate_limited`, ...). Absent when it did not say. */
  stop?: string;
  /** True when a cap cut the read short. */
  truncated: boolean;
  /** Items the read looked at before its conditions, when it counted them. */
  itemsSeen?: number;
  /** Rows the read kept. */
  kept: number;
  /** Whether the step is authored to follow pages. Absent when its authored parameters were not in reach. */
  paginates?: boolean;
  /** Whether the step is authored to keep one row per key, in any form the domain reads a `dedupe` in. Absent when its authored parameters were not in reach. */
  dedupes?: boolean;
  /** The column ids a row is identified by, when the step names them. */
  dedupeBy?: string[];
  /**
   * True when the read moves page by page (`next`, numbered), and so leaves out
   * a row identical, field for field, to one an earlier page yielded, whatever
   * its `dedupe` says: by its own count, or by its authored paging where the
   * count did not reach the record. Absent otherwise.
   */
  dropsEarlierPageRepeats?: true;
  /**
   * How many rows its conditions kept the read left out as such repeats
   * (live run `run-muqk713g`: 12 kept, 10 stored, the other two these). Absent
   * where the read did not count them.
   */
  earlierPageRepeats?: number;
  /**
   * The step's conditions, in authored order, each with the rows it rejected
   * across the whole read. A row can fail more than one, so the counts need not
   * add up to what was dropped. `condition` is absent where the wording could
   * not be carried; the count still is. `alone` is how many of those rows the
   * condition removed by itself (every other condition kept them): the rows
   * that say whether the condition is right, where its whole count cannot
   * (`run-mup2u8o3-6697c4be`: an accessory rule rejected 20, 5 alone, 3 of them
   * true answers). Absent where the read did not count it. `leftOutOnlyByThis`
   * names those rows, each by its first text column (its title), whole, so the
   * judge can check them against the request (live run 15: three earbuds "with
   * Wireless Charging Case"); absent where the read did not send them. Where
   * the row holds the column the condition tested, the row is said with that
   * value after its label, `label — column: value` (t195-w34, live run
   * `run-murwcaj0-40e56557`: "Jonas Weber — mutualFriends: Aisha Khan and 4
   * other mutual friends", which a regex for five or more had dropped).
   */
  conditions?: Array<{ condition?: string; rejected?: number; alone?: number; leftOutOnlyByThis?: string[] }>;
  /** True when every row failed the conditions and the read answered with the unfiltered rows instead. */
  unfiltered?: boolean;
  /** How many attempts of this step reported a read. Absent when one did; the account is the last one's. */
  attempts?: number;
};

/**
 * The bounded account of what a run produced, and of the shape of the Flow that
 * produced it.
 *
 * The Flow's shape is here because one of the four measured failures is only
 * visible in it: a request for the records matching a description produced a
 * Flow that navigated, extracted and ended, with no step that narrows anything,
 * so returning every record was the only thing it could ever do. Definition ids
 * and node ids are the same identifiers a run's recent actions already carry.
 */
export type AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1";
  /** Rows stored across every record set, including the ones not summarized. */
  totalRecordCount: number;
  /** Rows refused across every record set. */
  totalRefusedCount: number;
  /** Checked rows lacking a required value, across every record set summarized. */
  totalRowsMissingRequired: number;
  /** Record sets the run stored, including the ones not summarized. */
  recordSetCount: number;
  recordSets: AutomationStudioResultRecordSetSummary[];
  /**
   * How each list read went: pages, why paging stopped, items seen and kept,
   * and what each of its conditions rejected: every read and every condition.
   * Absent when no step reported a read.
   */
  reads?: AutomationStudioResultReadAccount[];
  /** The steps the Flow is built from, in authored order: what it can do at all. */
  flowShape: AutomationStudioResultFlowStepSummary[];
  /**
   * Core's sentence naming the columns the instruction asks for that no stored
   * column reads (`read-account/unread-columns.ts`). Set only on the summary the
   * judge is shown, and only when there are some. Information, never a verdict.
   */
  instructionColumnsUnread?: string;
  /**
   * True when a step's parameters were left out for want of room rather than
   * because the step had none.
   *
   * Stated separately from `withheld` because they answer different questions. A
   * reader of a step with no `parameters` has to be able to tell "this step runs
   * on its defaults" from "there was no room left to say", and the general
   * `withheld` flag -- which a cut column list or an unsampled row also sets --
   * cannot tell them apart.
   *
   * Set only by summaries written before 2026-09-30: a summary no longer has a
   * byte budget, so no step's parameters are left out for want of room. Kept
   * so a stored summary still reads.
   */
  flowParametersWithheld?: boolean;
  /** True when a record set, a row sample, a column list, a read's condition wording or the Flow shape was cut to fit. */
  withheld: boolean;
  /**
   * Present only when what is judged is a build's test, before its Flow is
   * proposed, rather than a finished run (`build-test/`). A test stores no
   * record set, so the judgement is made from each step's own words and what
   * the test observed of it.
   */
  buildTest?: AutomationStudioBuildTestAccount;
  /**
   * The page the run or test ended on, as the domain produced it, screened
   * (`./result-summary.ts`, `automationStudioResultEndView`). Absent when the
   * caller held none or it was withheld; a withheld one sets `withheld`.
   */
  endView?: AutomationStudioResultEndView;
};

/**
 * The view of its target -- for the web domain, the page -- a run or a test
 * ended on, as the domain produced it (t174-w87). Run `run-murwd8le-79e735a8`'s
 * judges never saw `Cart (3)`, the coupon's "Collected" or the quantity field,
 * and one of them invented a quantity that was never committed.
 */
export type AutomationStudioResultEndView = {
  /** What it was taken after: a test's step number, or the node a run ran last. */
  after?: number | string;
  /** The domain's view, by its own keys and screened, otherwise as it came. */
  view: JsonValue;
};

/**
 * One step of the Flow a build proposes, as the judge of its test reads it.
 *
 * `target` and `observed` are the domain's words and evidence, screened by the
 * builder (`build-test/summary.ts`) and checked again before sending
 * (`llm/harness/request-evidence-check.ts`). `claims` are the model's own and
 * prove nothing.
 */
export type AutomationStudioBuildTestStep = {
  /** The step's position in the draft, the number the repair is told. */
  step: number;
  /** What was done, under the caller's own name for it. */
  action: string;
  /** The step's own words from what it ran with, then what it was given: the name or text of what it acted on, the item, the option, the typed text. */
  target?: string[];
  /** The acts the step, or the build's result, names it for. Claims, not proof. */
  claims?: string[];
  /** How the step answered in this test. `not_run` when the test did not run it, or did not run at all. */
  outcome: "replayed" | "verified" | "present" | "remembered" | "failed" | "changed" | "unreproducible" | "not_run";
  /** Set when the step's effect lasts and the test only checked it rather than doing it again. */
  withheld?: true;
  /** The position of the checked step before this one whose withheld effect this step may have needed. */
  withheldBy?: number;
  /**
   * On a step that changes nothing (a read) that ran after checked steps whose
   * act the test left undone -- `verified` on the step or on any pass, not
   * `present`, which was already in place -- their positions, in order. The
   * read saw a page without what those acts make (a status they set, a row they
   * add), so rows missing for that reason are the test's, not the Flow's (run
   * `run-muw6144a-e56f945d`, C1).
   */
  afterWithheld?: number[];
  /**
   * Set on a step that did not hold in this test and that the Flow passes
   * over as written, saying why in Core's words ("optional: ...; in this test
   * it did not run, which does not stop the Flow"). Not a defect: it is why the
   * test passed with it (`../flow-draft/excused.ts`).
   */
  excused?: string;
  /** When the step runs, when it is not simply the next thing: optional, only if, on failure, or repeated over another step. */
  runs?: JsonValue;
  /** Set when the step was carried from an earlier Flow rather than run in this build. */
  carried?: true;
  /** What the test observed for this step: the rows a read returned, or a check's answer. */
  observed?: JsonValue;
  /** What the step did while the build explored, for a step the test only checked. */
  explored?: { changed: "yes" | "no" | "unknown"; resultCode?: string; stateChanged?: boolean };
  /**
   * A repeated step's passes, one per row of the list its span repeats over,
   * in order (t252 D6). `outcome` above is the first pass that did not pass,
   * else `replayed`; each pass's own answer and observation are here.
   */
  passes?: AutomationStudioBuildTestPass[];
};

/**
 * One pass of a repeated step as the judge of its test reads it (t252 D6).
 *
 * The row is named by its label only, the label the list read's `readRows`
 * gave it, screened as those are (`build-test/read-rows.ts`); a row's values
 * never travel here.
 */
export type AutomationStudioBuildTestPass = {
  /** 1-based: the row's place in the list. */
  pass: number;
  /** The row's label from the list the span repeats over; absent when that list named none for it. */
  row?: string;
  outcome: AutomationStudioBuildTestStep["outcome"];
  /** What the test observed on this pass, by the same rule as a step's `observed`. */
  observed?: JsonValue;
};

/**
 * One input the Flow takes, at the value its test used (t252 D4): the Flow's
 * parameter, declared by its first binding, and the steps that use it.
 */
export type AutomationStudioBuildTestInput = { name: string; test: JsonValue; steps: number[] };

/** A build's test, as its judge reads it: every proposed step in order, and the build's own reading of the instruction's acts. */
export type AutomationStudioBuildTestAccount = {
  kind: "build_test";
  /** `reused` when the test's answer was an earlier clean replay of the same Flow; `not_run` when no test applied to this Flow. */
  test: "ran" | "reused" | "not_run";
  steps: AutomationStudioBuildTestStep[];
  /** The build's checklist of the instruction's acts. Information, not proof. */
  checklist?: JsonObject[];
  /** What the build's own check found missing. Information, not proof. */
  missingActs?: JsonObject;
  /** What Core's capability checks found the accepted Flow cannot do. Information, not a refusal. */
  notes?: AutomationStudioBuildTestNote[];
  /** The Flow's inputs at the values the test ran on, once for the whole test. */
  inputs?: AutomationStudioBuildTestInput[];
};

/**
 * One thing a capability check found of the Flow a build proposes, carried to
 * the judge of its test as information (t195-w28a).
 *
 * The completion check used to refuse a Flow for it -- no step producing the
 * records the instruction asks for, no step going to where the Flow starts --
 * and send the model back to explore. Under the no-restrictions rule only the
 * permission gates refuse, so the Flow goes to its test and its judge, and
 * this is what the check found, for the judge to confirm against the steps and
 * for the repair to be told through the judge's reasons.
 *
 * Core's words and the instruction's only: the check's issue code and
 * sentence, the columns the instruction named, where the build was told to start.
 */
export type AutomationStudioBuildTestNote = {
  code: "bootstrap.cannot_answer_instruction" | "bootstrap.cannot_reach_start_location";
  /** Core's own sentence for what was found, quoting nothing. */
  said: string;
  /** The columns the instruction named, for a Flow that produces no records. */
  columns?: string[];
  /** Where the Flow starts, for a Flow no step of which goes there. */
  starts?: string;
};

/**
 * One thing wrong with what a run produced, as Core's own arithmetic found it.
 *
 * Coded, so a repair can act on it without reading prose, and ids only -- a
 * column id, a record set id -- because a value belongs to the person and a
 * count belongs to Core. `detail` is Core's sentence for a reader, never a
 * model's.
 */
export type AutomationStudioResultRepairFinding = {
  /** Core's stable code for this finding. */
  code: string;
  /** What was found, in Core's own words, bounded. */
  detail: string;
  /** The record set it is about, when it is about one. */
  datasetId?: string;
  /** The column ids it is about, bounded. Ids, never values. */
  columns?: string[];
};

/**
 * What to fix, and what the check itself said about it.
 *
 * The user's instruction of 2026-09-26: "judging answers: it should give
 * explicit instructions on what to fix regarding the data + possible
 * suggestions." Before this, a refutation was a verdict and a code. Five
 * consecutive live runs were refuted as `core.result.does_not_answer_request`,
 * correctly, and that string was the whole of what the repair was told -- so the
 * repair had to rediscover the defect from scratch, at the cost of a second full
 * exploration, and on the one run where it reached the model it produced no
 * correction at all.
 *
 * **The two halves are kept apart because their provenance differs.**
 * `findings` and `fix` are Core's: arithmetic over the summary it already holds,
 * and a sentence per finding that Core wrote. `judgement` is the model's own
 * reading, screened. A run record carries only the first two
 * (`run-outcome.ts`); the second reaches the repair through the failure record's
 * `expected` and `actual`, which is where a sentence written outside Core has
 * always travelled (`llm/harness/locator-text.ts`).
 *
 * **Nothing here is demanded of the model.** No new response field, no new
 * schema key, nothing a malformed answer can fail: `judgement` is read off the
 * `expected`, `observed` and `changed` the diagnosis channel already carries, and
 * a field that is missing, oversized, wrongly typed or refused by a screen is
 * simply absent from the directive. A judgement that says nothing beyond `no`
 * still produces a valid refutation with Core's own findings in it.
 */
export type AutomationStudioResultRepairDirective = {
  schemaVersion: "automation-studio.result-repair-directive.v1";
  /** What Core found wrong with the data, in the order found. */
  findings: AutomationStudioResultRepairFinding[];
  /** What to do about it, in reading order. Core's own words, one line per finding. */
  fix: string[];
  /**
   * What the check itself said, screened and bounded: what it took the request
   * to ask for, what it saw instead, and what it advised. Every part optional --
   * absent advice is still a valid refutation, and a run must never fail because
   * the judgement was terse.
   */
  judgement?: { expected?: string; observed?: string; advice?: string; /** Whether what was asked can still be had: a build ends "not doable" only on `no` (t195-w37). */ stillAchievable?: "yes" | "no" | "unknown" };
  /** True when something the judgement said was dropped by a screen rather than carried. */
  withheld?: boolean;
};

/** The verdict, the reason a person reads, and the observation behind it. */
export type AutomationStudioResultVerification = {
  schemaVersion: "automation-studio.result-verification.v1";
  verdict: AutomationStudioResultVerdict;
  basis: AutomationStudioResultVerdictBasis;
  /** Core's stable code for why this verdict was reached. */
  code: string;
  /** Why, in a sentence, in Core's own words. */
  reason: string;
  /** What was actually observed: counts, never a model's prose or a row's contents. */
  observation: string;
  /**
   * The verdict each verification call returned, in the order asked: one, or
   * two when the first answered anything but `answers`, or answered `answers` on
   * a verification that confirms it (`confirmAnswer`). Verdict words only,
   * never the model's prose. Absent when no model was asked.
   */
  verdicts?: AutomationStudioResultVerdict[];
  /** The verification calls made or attempted: 1 or 2. Absent when no model was asked. */
  calls?: number;
  /**
   * What to fix, present exactly when the verdict is `does_not_answer`.
   *
   * A verdict of `unsure` deliberately carries none: nobody judged the result
   * wrong, so there is nothing to instruct a repair to change, and
   * `recovery/refuted-result/attempt.ts` refuses to build a repair from an
   * `unsure` for the same reason.
   */
  repair?: AutomationStudioResultRepairDirective;
  /**
   * On a verification two checks did not settle (`model_disagreed`,
   * `model_unconfirmed`), the reading of the call that judged
   * `does_not_answer`: its expected, observed and advice, as screened for that
   * call's `repair.judgement`. One judge's reading the other call did not
   * confirm, and nothing more: never a `repair` or a `failure` record, so it
   * fails no run (`automationStudioResultVerificationFailsRun`) and builds no
   * runtime repair. A build's repair is told it (`build-test/judge.ts`), because
   * dropping it sent live run murwcmx2's repair back with only "unverified"
   * while one call had said which condition to narrow. Absent when no call
   * judged `does_not_answer`, or that call said nothing beyond its verdict. Like
   * `repair.judgement`, it is the model's prose and is not recorded on a run
   * (`run-outcome.ts`).
   */
  unconfirmedReading?: NonNullable<AutomationStudioResultRepairDirective["judgement"]>;
  /**
   * Present exactly when the verification fails the run
   * (`automationStudioResultVerificationFailsRun`): what the run must report.
   */
  failure?: AutomationStudioFailureRecord;
  /**
   * The exact code of what stopped the verification: the diagnostic code of a
   * call that did not come back usable, or the error's own name where there was
   * none. For a debug reading the record; never put into `reason` or
   * `observation`, which are said in the chat. Absent when nothing failed.
   */
  failureCode?: string;
};

/**
 * Why a run was not verified at all.
 *
 * This is not a verdict and must never be read as one. A run that produces no
 * records has no result to judge, and a deployment with no model configured
 * cannot ask for a judgement -- neither is the model saying "it looks fine".
 * Recording the reason is what keeps the two apart on a run's record.
 */
export type AutomationStudioResultVerificationSkipped = {
  schemaVersion: "automation-studio.result-verification.v1";
  performed: false;
  code: string;
  reason: string;
  /** The error's own name, when the verification threw before a verdict. Never in `reason`. */
  failureCode?: string;
};

/** What a finished run's verification produced: a verdict, or a stated reason there is none. */
export type AutomationStudioResultVerificationOutcome =
  | (AutomationStudioResultVerification & { performed: true })
  | AutomationStudioResultVerificationSkipped;

/**
 * Whether a verification lets a run keep reporting success.
 *
 * The single reader of a verdict, and the whole of the fail-closed rule: only
 * `answers` passes. `unsure` fails here, and it must, because the failure this
 * module exists to catch is precisely a run that reported success while nobody
 * had checked. A verification that was never performed is not a verdict and
 * never reaches this function.
 */
export function automationStudioResultVerificationAnswers(verification: AutomationStudioResultVerification): boolean {
  return verification.verdict === "answers";
}

/**
 * Whether a verification fails the run it judged.
 *
 * Every verdict but `answers` does, fail-closed, with one exception: a result
 * the model was asked about twice, with the same evidence, without either
 * saying `yes` twice or `no` twice (`model_disagreed`, `model_unconfirmed`).
 * Both `no` and `unknown` were measured to flip on identical rows at
 * temperature 0 (2026-09-18, 2026-09-21), and failing a run whose every step
 * succeeded on an answer the model does not repeat is the false failure this
 * exception exists to stop. Such a result is recorded `unverified`, never
 * `confirmed`.
 */
export function automationStudioResultVerificationFailsRun(verification: AutomationStudioResultVerification): boolean {
  if (automationStudioResultVerificationAnswers(verification)) return false;
  return verification.basis !== "model_disagreed" && verification.basis !== "model_unconfirmed";
}
