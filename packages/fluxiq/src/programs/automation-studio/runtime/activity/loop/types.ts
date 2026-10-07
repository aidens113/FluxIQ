/**
 * One do-while loop of a Flow, as the activity stream speaks of it: the
 * Repeat node at its head, the nodes a pass runs, and what a pass is called.
 * A loop whose pass reads a list calls its pass a page (read-list design (7),
 * proof 3); any other loop calls it a pass.
 */
export type AutomationStudioActivityLoop = { repeatId: string; members: ReadonlySet<string>; unit: "page" | "pass" };

/** Which pass of which loop a step runs as. */
export type AutomationStudioActivityLoopPass = { repeatId: string; pass: number; unit: "page" | "pass" };
