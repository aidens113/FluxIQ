import { cellText } from "../cell-text.ts";
import { readAutomationStudioRecordNumber } from "../read-number.ts";
import { readAutomationStudioRecordConditionDate } from "../row-date.ts";

/** Availability of a primitive reading; it never substitutes an absent flag or guessed number/date. */
export function automationStudioRecordRequiredValueIssue(cell: unknown, kind: "value" | "text" | "number" | "date", now: number): "missing" | "unreadable" | undefined {
  const text = cellText(cell);
  if (text === undefined) return "missing";
  if ((typeof cell === "number" && !Number.isFinite(cell)) || ["[withheld]", "(withheld)", "(no value)"].includes(text)) return "unreadable";
  if (kind === "value") return undefined;
  if (typeof cell !== "string" && typeof cell !== "boolean" && typeof cell !== "number") return "unreadable";
  if (kind === "number") {
    const number = typeof cell === "number" ? cell : readAutomationStudioRecordNumber(text);
    if (number === undefined) return "unreadable";
  }
  if (kind === "date" && readAutomationStudioRecordConditionDate(text, now) === undefined) return "unreadable";
  return undefined;
}
