import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioTrialChangeFinding, AutomationStudioTrialSiteChange } from "../../flow-bootstrap/trial-change/index.ts";
import type { AutomationStudioResultRecordSetSummary } from "../record-set-summary.ts";
import type { AutomationStudioBuildTestAccount } from "./build-test.ts";
import type { AutomationStudioResultEarlierAdvice } from "./earlier-advice.ts";
import type { AutomationStudioResultFlowStepSummary } from "./flow-step-summary.ts";
import type { AutomationStudioResultReadAccount } from "./read-account.ts";
import type { AutomationStudioResultTaskChecklist } from "./task-checklist.ts";

/**
 * One condition's left-out rows that name the asked item (`AutomationStudioRunResultSummary.leftOutNamingTheItem`).
 *
 * `step` is the build test's step number, `nodeId` a finished run's read node;
 * `condition` the condition as the read names it; `item` the request's phrase
 * every kept row names first; `also` the request's phrases each row names only
 * after it; `rows` the rows, by label, as the read gave them.
 */
export type AutomationStudioResultLeftOutNamingTheItem = {
  step?: number;
  nodeId?: string;
  condition: string;
  item: string;
  also: string[];
  rows: string[];
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
   * The single value each step returned in this run, in run order, with Core's
   * sentence saying a returned value is handed on and is no stored record
   * (`../returned-values.ts`, t757). Absent where no step returned one or no
   * denied-keys declaration was made.
   */
  returned?: AutomationStudioResultReturnedValues;
  /**
   * Core's sentence naming the columns the instruction asks for that no stored
   * column reads (`read-account/unread-columns.ts`). Set only on the summary the
   * judge is shown, and only when there are some. Information, never a verdict.
   */
  instructionColumnsUnread?: string;
  /** Core's words to a check asked again because its doubt contradicted Core's record (`./agreement.ts`, t503); only on that ask's copy. */
  recheck?: string;
  /**
   * Rows a read left out by one condition alone, tested on the row's own label,
   * whose label names first the request's phrase every kept row names first and
   * another of the request's phrases only after it (`request-rows/`): by their
   * own words the item asked for, sold with or including something the request
   * leaves out. Set only on the summary the judge is shown, and only when there
   * are some. A `yes` that does not account for each is not a `yes` (`../verdict/`).
   */
  leftOutNamingTheItem?: AutomationStudioResultLeftOutNamingTheItem[];
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
   * A project build's judge only (unit A9, `build-test/task-checklist.ts`):
   * the supervisor's task spec as a checklist beside the instructions -- what
   * they ask, part by part, and what they do not ask -- labelled in its own
   * `supplementary` text as subordinate to them. Never set on a candidate
   * build's summary or a finished run's.
   */
  taskChecklist?: AutomationStudioResultTaskChecklist;
  /**
   * A candidate build's trial only (t471): what of the build itself was
   * already on the site when the trial began, because the build could not
   * undo it -- one line per act it had done and per difference from how it
   * found the site (`../flow-bootstrap/candidate/started-with.ts`). The judge
   * reads each as already done, neither the run's doing nor its failure.
   */
  startedWith?: string[];
  /**
   * The page the run or test ended on, as the domain produced it, screened
   * (`./result-summary.ts`, `automationStudioResultEndView`). Absent when the
   * caller held none or it was withheld; a withheld one sets `withheld`.
   */
  endView?: AutomationStudioResultEndView;
  /**
   * The same view of the page before the run or test did anything, screened
   * the same way: for a finished run, the page its first step that saw the
   * page found, or left when it moved to another document (`./result-summary.ts`);
   * for a build's test, one look just before it (`llm/node-tools/dry-run-gate.ts`),
   * the site as exploration left it. What it already shows predates what is
   * judged (run `run-mux6pndp-16feb842`: "2 · $28.96" read as the two packs).
   */
  startView?: AutomationStudioResultEndView;
  /**
   * A build's trial only (t775, `../../flow-bootstrap/trial-change/`): what
   * Core read at each place a lasting step's change shows, just before the
   * trial and just after it, what each act did (`already_in_state` apart: it
   * did not act), the build's acts left in place at its start, and what that
   * proves of each task part with a typed effect. The judge reads each such
   * part by the change, never by the state after alone, and the agreement
   * takes no yes over a part the change does not prove
   * (`../site-change/held.ts`). Screened before it is set
   * (`../../service/candidate-trial/summary.ts`); never on a finished run's
   * summary or an offline trial's. Before `earlierAdvice`, which stays last.
   */
  siteChange?: AutomationStudioTrialSiteChange;
  /**
   * Core's own closed findings over `siteChange`
   * (`automationStudioTrialChangeFindings`): a part asking for a change that
   * no place shows (`result.change_not_seen`), a place that changed with no
   * act of the trial attributed to it (`result.unasked_change`). Information
   * for the judge, as Core's other findings on the summary are; never a
   * verdict. Absent when there are none.
   */
  siteChangeFindings?: AutomationStudioTrialChangeFinding[];
  /**
   * A build test only (t752, `./earlier-advice.ts`): each earlier judged trial
   * of this build's advice, oldest first, at most three, with whether this
   * revision changed what it named. Set by the gate that keeps the build's
   * trials; appended last where the summary is made, so the judge's cached
   * prefix is unchanged. Never set on a finished run's summary.
   */
  earlierAdvice?: AutomationStudioResultEarlierAdvice[];
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
 * The single values a run's steps returned (`AutomationStudioRunResultSummary.returned`,
 * t757): each by the step that returned it, in run order, beside Core's
 * sentence for what they are. Read off a step's `outputs.value`, Core's port
 * for a node's single value, and screened as every run value is.
 */
export type AutomationStudioResultReturnedValues = {
  said: string;
  values: Array<{ nodeId: string; value: string | number | boolean }>;
};
