import { emitAutomationStudioActivity } from "../../../../../runtime/automation-activity/index.ts";

/** A plain line in the chat from the attempt itself: Core's words, never a page's or a model's. */
export function automationStudioAnswerFirstSay(title: string, text: string): void {
  emitAutomationStudioActivity({ phase: "building", label: title, detail: { kind: "note", title, text } });
}
