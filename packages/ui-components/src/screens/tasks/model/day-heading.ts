// The day a task or attempt falls under, as a heading: "Today", "Yesterday", "Tuesday", "12 Oct".

import { dayWords } from "../../../chat/answer/words/index.ts";

/** `ms`'s day said against `nowMs`, capitalised; "Earlier" where the time is not known. */
export function dayHeading(ms: number, nowMs: number): string {
  const day = dayWords(ms, nowMs);
  if (day === undefined) return "Earlier";
  return day.charAt(0).toUpperCase() + day.slice(1);
}
