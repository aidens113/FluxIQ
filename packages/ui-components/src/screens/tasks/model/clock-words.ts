// A moment's time of day as a person reads it, in local time: "14:05". Not a real time says nothing.

/** `ms` as HH:MM, or undefined when it is not a usable time. */
export function clockWords(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const date = new Date(ms);
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}
