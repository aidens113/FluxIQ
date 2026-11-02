import type { ResultRequestedRows } from "./rows.ts";

/**
 * The answer a part of the build's task spec declares it asks for, as the
 * judge's checklist carries it (`project-agents/contracts/task-spec.ts`,
 * `answer`, t757): records, with the columns the request names, in its order;
 * an empty list where it names none; and how many rows, where it says (K2).
 * Absent on a part, none is owed.
 */

export type ResultRequestedAnswer = { kind: "records"; columns: string[]; rows?: ResultRequestedRows };
