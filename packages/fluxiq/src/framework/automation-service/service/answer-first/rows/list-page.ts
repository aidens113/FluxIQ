import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowLessReadLeftOut } from "../../../../../runtime/result-verification/index.ts";

/** One read's rows as it read them, where in the list (`place`) and which view of the site (`where`, page words apart), where that was said, and what its own conditions left out, where its answer said (`./read-evidence.ts`). No rows: a further page read the same way that kept none (`./row-sink.ts`). */
export type AutomationStudioAnswerFirstListPage = { rows: JsonObject[]; place?: string; where?: string; leftOut?: AutomationStudioFlowLessReadLeftOut };

/** What one read of the result's list is told as: its view of the site and place in it, where said, how many rows it kept and which (`rows`, none for a page that kept none), and what its conditions left out, where said. */
export type AutomationStudioAnswerFirstReadPage = { where?: string; place?: string; kept: number; rows?: JsonObject[]; leftOut?: AutomationStudioFlowLessReadLeftOut };
