import type { AutomationStudioProjectTaskAnswerRows } from "./answer-rows.ts";

/** A part's declared answer (header, t757): records, with the columns the request names, in its order, and how many rows where it says (header, K2). */
export type AutomationStudioProjectTaskAnswer = { kind: "records"; columns: string[]; rows?: AutomationStudioProjectTaskAnswerRows };
