import { automationStudioConversationPageShown, type AutomationStudioConversationOnScreen } from "../../../../runtime/conversations/index.ts";

/** The longest page address carried as a build's start location. */
const PAGE_ADDRESS_MAX = 2_048;

/**
 * What the panel has open. Anything that is not a non-empty string is left out
 * rather than refused, and so is a page address that is not http or https or
 * is longer than a start location may be: it is context, and a message is not
 * refused for the context it came with.
 */
export function requestedOnScreen(value: unknown): AutomationStudioConversationOnScreen {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const onScreen: AutomationStudioConversationOnScreen = {};
  for (const key of ["flowId", "subflowId", "runId", "recordingId"] as const) {
    const entry = record[key];
    if (typeof entry === "string" && entry.trim()) onScreen[key] = entry.trim();
  }
  const pageUrl = typeof record.pageUrl === "string" ? record.pageUrl.trim() : "";
  // A control character or space in an address that reaches a prompt is a mistake or an attempt to break out of it.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point.
  if (pageUrl && pageUrl.length <= PAGE_ADDRESS_MAX && automationStudioConversationPageShown(pageUrl) !== null && !/[\s\u0000-\u001f\u007f]/u.test(pageUrl)) onScreen.pageUrl = pageUrl;
  return onScreen;
}
