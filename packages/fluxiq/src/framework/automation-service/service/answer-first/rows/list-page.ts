import type { JsonObject } from "../../../../../core/index.ts";

/** One read's rows as it read them, and where in the list, where that was said. */
export type AutomationStudioAnswerFirstListPage = { rows: JsonObject[]; place?: string };
