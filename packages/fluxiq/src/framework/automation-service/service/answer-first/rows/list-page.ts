import type { JsonObject } from "../../../../../core/index.ts";

/** One read's rows as it read them, where in the list (`place`) and which view of the site (`where`, page words apart), where that was said. No rows: a further page read the same way that kept none (`./row-sink.ts`). */
export type AutomationStudioAnswerFirstListPage = { rows: JsonObject[]; place?: string; where?: string };

/** What one read of the result's list is told as: its view of the site and place in it, where said, and how many rows it kept. */
export type AutomationStudioAnswerFirstReadPage = { where?: string; place?: string; kept: number };
