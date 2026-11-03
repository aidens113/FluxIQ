import type { AutomationStudioResultRequestedAnswer } from "./requested-output.ts";

/** The change a part asks for (t775): `change`, a number of `what` added or removed; `end_state`, the state that holds once it is done. */
export type AutomationStudioResultTaskEffect =
  | { kind: "change"; direction: "adds" | "removes"; count: number | "each_match"; what: string }
  | { kind: "end_state"; state: string };

/**
 * The task checklist a project build's judge is sent (`taskChecklist`): first
 * its own label, saying the instructions are the only authority and how the
 * checklist is used, because the judge's standing instruction does not name
 * it; then each part the instructions ask for, in their own words, and what
 * they do not ask for; for a subflow trial, the parts other subflows do.
 * A part whose task spec declares the answer it asks for carries it
 * (`answer`, t757): the obligation a yes is held to (`../requested-output/`).
 */
export type AutomationStudioResultTaskChecklist = {
  supplementary: string;
  /** A part whose task spec types the change it asks for carries it (`effect`, t775): judged by the difference from the state before the run. */
  asked: Array<{ part: string; words: string; goalFacts: string[]; lastingActs: string[]; answer?: AutomationStudioResultRequestedAnswer; effect?: AutomationStudioResultTaskEffect }>;
  notAsked: string[];
  /** What the task spec says must show no change (t775), judged by before and after, never by its state. Absent where it names none. */
  unchanged?: string[];
  /**
   * A subflow trial's only (t594): the other parts of the same instructions,
   * each another subflow's work, which a step of this trial must not do.
   * Absent for a whole trial and wherever no other part exists.
   */
  outOfScope?: Array<{ part: string; words: string }>;
  /**
   * A subflow trial's only, where earlier subflows ran in it to prepare its
   * entry (t599): those subflows, by key, and every step of the trial that is
   * theirs, by nodeId -- the calls that ran them and their own steps. Each was
   * judged in its own trial: their reads are no part of this trial's quote
   * obligation (`./request-rows/summary-reads.ts`) and their presses no
   * out-of-scope step (`./build-test/task-checklist.ts`). Absent otherwise.
   */
  entry?: { subflows: string[]; steps: string[] };
  /**
   * A subflow trial's only (t676): the steps of this subflow, by nodeId, that
   * declared no lasting act yet changed their own page where they acted, so
   * Core recorded each as possibly lasting
   * (`../../service/candidate-trial/landed-acts.ts`). Their own
   * `consequences: none` is no proof they left nothing
   * (`./build-test/task-checklist.ts`). Absent where there is none.
   */
  possiblyLasting?: string[];
};
