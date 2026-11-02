/**
 * How many rows a part's declared answer asks for, where its task spec says
 * (`project-agents/contracts/task-spec.ts`, `answer.rows`, framework plan K2):
 * exactly `count`, or at least `atLeast` and at most `atMost`. Absent, the
 * count is not Core's to check (`../computed-facts/count.ts`).
 */

export type ResultRequestedRows = { count?: number; atLeast?: number; atMost?: number };
