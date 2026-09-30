/** A command argument as trimmed text: a string as written, a number as its digits, anything else empty. */
export function automationStudioConversationCommandText(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
