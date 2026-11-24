// A tool as a decision is read against it: the id a call names and the input
// schema the decision schema shows for it. The loop's own tools, the harness's
// `evidenceTools`, and the tool-call variants of the decision schema the
// provider adapter checks all have this shape, so every reader reads one way.

import type { JsonObject } from "../../../core/index.ts";

/** An offered tool, as far as reading a decision needs it. */
export type AutomationStudioLlmDecisionReadingTool = { readonly toolId: string; readonly inputSchema: JsonObject };
