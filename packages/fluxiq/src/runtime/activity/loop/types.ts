/**
 * One do-while loop of a Flow, as the activity stream speaks of it: the
 * Repeat node at its head, the nodes a pass runs, and what a pass is called.
 * A loop whose pass reads a list calls its pass a page (read-list design (7),
 * proof 3); any other loop calls it a pass.
 */
export type AutomationStudioActivityLoop = { repeatId: string; members: ReadonlySet<string>; unit: "page" | "pass" };

/**
 * Which pass of which loop a step runs as. `row` is the row a pass of a list
 * loop (`repeat over`, `nodes/control-flow/for-each.ts`) is on, as a person
 * reads it -- its first text field ("Jonas Weber") -- so a card can say
 * "Confirm · Jonas Weber" (t378, lane D). A step in a list loop alone runs as
 * a `row` pass, which says no page or pass number of its own.
 */
export type AutomationStudioActivityLoopPass = { repeatId: string; pass: number; unit: "page" | "pass" | "row"; row?: string };
