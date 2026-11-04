// A past moment as a person says the day: "today", "yesterday", "Tuesday" within the last
// week, and "12 Oct" beyond it. Local time. A moment that is not a real time says nothing,
// and one in the future is not told as a day.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The day `ms` fell on, said against `nowMs`; undefined when `ms` is not a usable time. */
export function dayWords(ms: number, nowMs: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const days = Math.round((startOfDay(nowMs) - startOfDay(ms)) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  const date = new Date(ms);
  if (days < 7) return WEEKDAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
