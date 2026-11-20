import type { JsonObject } from "../../../../core/index.ts";

/** The exact input dictionary and parameter object one callback invocation receives. */
export type AutomationStudioInputUseNodeValues = Readonly<{ inputs: JsonObject; parameters: JsonObject }>;
