// The object in a chat model's answer, read forgivingly: a provider's
// envelope around the model's own text is opened, prose around the object is
// set aside. Shared by the decision (`./parse.ts`) and the declaration every
// answer opens with (`./intent.ts`), so both read the same object.

/** The object in an answer, null when the answer holds no object at all, or `"unreadable"` when it holds a broken one. */
export function automationStudioConversationAnswerRecord(raw: unknown): Record<string, unknown> | null | "unreadable" {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    // A provider envelope around the model's own text: read the text.
    for (const key of ["output", "content", "text", "completion"]) {
      const inner = record[key];
      if (typeof inner === "string" && Object.keys(record).length <= 3 && inner.includes("{")) return automationStudioConversationAnswerRecord(inner);
    }
    return record;
  }
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0) return null;
  if (end <= start) return "unreadable";
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : "unreadable";
  } catch {
    // Braces that do not hold JSON. Not a refusal and not an empty answer: the
    // caller asks the model again with the reason, then reads the words itself.
    return "unreadable";
  }
}
