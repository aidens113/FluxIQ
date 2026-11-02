/**
 * One condition's left-out rows that name the asked item (`AutomationStudioRunResultSummary.leftOutNamingTheItem`).
 *
 * `step` is the build test's step number, `nodeId` a finished run's read node;
 * `condition` the condition as the read names it; `item` the request's phrase
 * every kept row names first; `also` the request's phrases each row names only
 * after it; `rows` the rows, by label, as the read gave them.
 */

export type ResultLeftOutNamingTheItem = {
  step?: number;
  nodeId?: string;
  condition: string;
  item: string;
  also: string[];
  rows: string[];
};
