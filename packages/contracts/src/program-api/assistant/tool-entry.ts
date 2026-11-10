import type { ProgramApiJsonSchema } from "../input/index.ts";
import type { AssistantConsequence } from "./consequence.ts";
import type { PanelContextKey } from "./panel-context-key.ts";

/**
 * One program API endpoint the panel assistant may call, as the catalog lists
 * it. `name` is `<programId>__<endpoint>`, a valid provider tool name.
 * `consequence` is `per-call` for a run, whose class is the target Flow's.
 */
export type AssistantToolEntry = {
  name: string;
  programId: string;
  endpoint: string;
  summary: string;
  phrases: readonly string[];
  consequence: AssistantConsequence | "per-call";
  /** Input field -> the panel context key that fills it. */
  contextArgs: Readonly<Record<string, PanelContextKey>>;
  inputSchema: ProgramApiJsonSchema;
};

/** An endpoint the assistant is never offered, and why. */
export type AssistantHiddenEndpoint = {
  name: string;
  programId: string;
  endpoint: string;
  reason: string;
};

/** The generated assistant catalog: every declared tool and every hidden endpoint, by name. */
export type AssistantToolCatalogFile = {
  tools: readonly AssistantToolEntry[];
  hidden: readonly AssistantHiddenEndpoint[];
};
