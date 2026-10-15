/**
 * The task checklist a project build's judge is sent (`taskChecklist`): first
 * its own label, saying the instructions are the only authority and how the
 * checklist is used, because the judge's standing instruction does not name
 * it; then each part the instructions ask for, in their own words, and what
 * they do not ask for; for a subflow trial, the parts other subflows do.
 */
export type AutomationStudioResultTaskChecklist = {
  supplementary: string;
  asked: Array<{ part: string; words: string; goalFacts: string[]; lastingActs: string[] }>;
  notAsked: string[];
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
};
