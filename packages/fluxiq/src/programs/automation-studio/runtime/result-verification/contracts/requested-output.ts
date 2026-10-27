/**
 * The answer a part of the build's task spec declares it asks for, as the
 * judge's checklist carries it (`project-agents/contracts/task-spec.ts`,
 * `answer`, t757): records, with the columns the request names, in its order;
 * an empty list where it names none. Absent on a part, none is owed.
 */
export type AutomationStudioResultRequestedAnswer = { kind: "records"; columns: string[] };

/**
 * What a run owes by the build's own declaration (`../requested-output/`,
 * t757): each part whose declared answer is records, by id, with its columns.
 * Never read off the request's words.
 */
export type AutomationStudioResultRequestedOutput = { parts: Array<{ part: string; columns: string[] }> };

/**
 * Core's finding that a run owed records and stored none, with nothing in the
 * run's own record showing a list read to its end where nothing matched
 * (`../requested-output/`, t757): the parts and columns owed, and Core's
 * sentence for it. Set on the verification of a yes it holds.
 */
export type AutomationStudioResultRequestedOutputMissing = AutomationStudioResultRequestedOutput & { said: string };
