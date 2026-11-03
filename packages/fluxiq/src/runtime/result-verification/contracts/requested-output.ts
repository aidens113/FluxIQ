/**
 * The answer a part of the build's task spec declares it asks for, as the
 * judge's checklist carries it (`project-agents/contracts/task-spec.ts`,
 * `answer`, t757): records, with the columns the request names, in its order;
 * an empty list where it names none; and how many rows, where it says (K2).
 * Absent on a part, none is owed.
 */
export type AutomationStudioResultRequestedAnswer = { kind: "records"; columns: string[]; rows?: AutomationStudioResultRequestedRows };

/**
 * How many rows a part's declared answer asks for, where its task spec says
 * (`project-agents/contracts/task-spec.ts`, `answer.rows`, framework plan K2):
 * exactly `count`, or at least `atLeast` and at most `atMost`. Absent, the
 * count is not Core's to check (`../computed-facts/count.ts`).
 */
export type AutomationStudioResultRequestedRows = { count?: number; atLeast?: number; atMost?: number };

/**
 * What a run owes by the build's own declaration (`../requested-output/`,
 * t757): each part whose declared answer is records, by id, with its columns
 * and, where it declares them, how many rows (K2).
 * Never read off the request's words.
 */
export type AutomationStudioResultRequestedOutput = { parts: Array<{ part: string; columns: string[]; rows?: AutomationStudioResultRequestedRows }> };

/**
 * Core's finding that a run owed records and stored none, with nothing in the
 * run's own record showing a list read to its end where nothing matched
 * (`../requested-output/`, t757): the parts and columns owed, and Core's
 * sentence for it. Set on the verification of a yes it holds.
 */
export type AutomationStudioResultRequestedOutputMissing = AutomationStudioResultRequestedOutput & { said: string };
