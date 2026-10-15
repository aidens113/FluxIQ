import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

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
  explored?: { changed: "yes" | "no" | "unknown"; resultCode?: string; stateChanged?: boolean; landed?: AutomationStudioBuildTestLanding };
  /**
   * A repeated step's passes, one per row of the list its span repeats over,
   * in order (t252 D6). `outcome` above is the first pass that did not pass,
   * else `replayed`; each pass's own answer and observation are here.
   */
  passes?: AutomationStudioBuildTestPass[];
};

/**
 * A checked step's act as the build did it earlier in this build, when a rerun
 * did it or a later check replaced the step's record (t443): `counts` when it
 * ran after the steps before it -- done again on its put-back page, or already
 * in the state it found -- as the step now stands. `after` is those steps with
 * their words (the choices it was made with); `pressed`, its own words when
 * they are not the step's now; `why`, why it does not count.
 */
export type AutomationStudioBuildTestLanding = {
  counts: boolean;
  after?: Array<{ step: number; target?: string[] }>;
  pressed?: string[];
  why?: string;
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
  /**
   * What the Flow would store, as this test's reads filled it: one entry per
   * dataset it writes, in Flow order (`build-test/stores.ts`). The answer the
   * Flow gives, though the test itself stored nothing. Empty when no step of
   * the Flow stores; absent when the test did not run or the Flow's nodes were
   * not known.
   */
  stores?: AutomationStudioBuildTestStore[];
};

/**
 * One dataset the Flow a build proposes would write, as its test's reads
 * filled it (t274-c3). Live run `run-muw60j7c-bb7c9a62` (C-3): two reads
 * appended 20 unfiltered rows and then 10 filtered ones into one dataset, 3 of
 * them twice, and both judges of the test, told it stored nothing, said yes.
 */
export type AutomationStudioBuildTestStore = {
  /** The dataset's id, as the Flow's record output names it. */
  dataset: string;
  /**
   * How its steps write it: `append` adds to what earlier steps stored,
   * `replace` clears it first. One word when every step that writes it says
   * the same, else each step's, in order ("append at step 6, replace at step 7").
   */
  writeMode: string;
  /** The steps that write it, by their number in `steps`, in Flow order. */
  steps: number[];
  /** How many answers of those steps' reads filled it in this test: one per pass of a repeated read, so one per page a loop read. */
  passes: number;
  /** The rows those reads returned in this test, every page's, rows a read did not list included, less any a later `replace` clears: what the run collects before its end makes the answer. */
  collected: number;
  /**
   * What the Flow would store: the collected rows made into the answer as a
   * run's end makes it (read-list design 5.1; `processAutomationStudioRecordRows`):
   * each row once (the whole row is its identity unless the read names a
   * dedupe key), then the read's own sort and limit. `rows` counts them;
   * `labels` names them in answer order, screened as a read's `readRows` are; a
   * row a read did not list counts and has no label.
   */
  answer: { rows: number; labels: string[] };
  /**
   * The collected rows the answer leaves out: repeats of an earlier row,
   * rows a condition over stored columns left out, rows past the limit.
   * Absent when the test could not make the answer -- its reads named their
   * rows by label only, and labels alone cannot tell two rows apart -- and
   * then `answer` is the collected rows as they came.
   */
  removed?: { duplicates: number; filteredOut: number; cut: number };
  /** True when the reads collected rows and the answer keeps none of them. */
  keptNone?: true;
  /** The labels that occur more than once in `answer.labels`, each once, in the order first seen. Absent when none does. */
  repeated?: string[];
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
