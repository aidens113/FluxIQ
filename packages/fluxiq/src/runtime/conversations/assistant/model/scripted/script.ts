import type { JsonValue } from "../../../../../core/index.ts";

/**
 * What a browser test writes for the scripted assistant: scenarios, each chosen
 * by words the person's latest message contains (any case), each a list of the
 * model's decisions in order. A decision is what the real model answers
 * (`{"tool": "...", "input": {...}, "why": "..."}` or `{"reply": "..."}`); a
 * value inside a tool's input may be `{"$answer": "path.in.the.last.answer"}`,
 * read from what the previous tool answered (a version number it was just
 * told, say). After the last decision, or when no scenario fits, it replies.
 */
export type PanelAssistantScript = {
  scenarios: ReadonlyArray<{ when: string; turns: readonly JsonValue[] }>;
  /** What it says after the last decision of a scenario. Default "Done." */
  after?: string;
  /** What it says when no scenario fits. Default "Nothing is scripted for that." */
  otherwise?: string;
};
