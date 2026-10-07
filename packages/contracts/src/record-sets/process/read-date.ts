// The instant a text value states (P7), as the downstream web domain's sort
// reads it, kept equal to it by `AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES`.
//
// A date is relative to `now` ("3 days ago", "30+ days ago", "an hour ago",
// "yesterday", "just posted") or absolute ("2026-09-12", "12 Sep 2026",
// "Sep 12", "13/02/2026"). A month and day with no year is the latest such date
// not after `now` plus a day. A numeric date is day first only when its first
// number cannot be a month. "today" and "now" count only as the whole value,
// since "Apply today" is not a date. Absolute dates are read as UTC.

import { collapsedText } from "./cell-text.ts";

const DAY_MS = 86_400_000;

/** Milliseconds per unit of a relative date, by every spelling a listing uses for it. */
const UNIT_MS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(?:seconds?|secs?|s)$/u, 1_000],
  [/^(?:minutes?|mins?)$/u, 60_000],
  [/^(?:hours?|hrs?|h)$/u, 3_600_000],
  [/^(?:days?|d)$/u, DAY_MS],
  [/^(?:weeks?|wks?|w)$/u, 7 * DAY_MS],
  [/^(?:months?|mos?)$/u, 30 * DAY_MS],
  [/^(?:years?|yrs?|y)$/u, 365 * DAY_MS]
];

const RELATIVE = /\b(\d+(?:\.\d+)?|an?|one)\+?\s*(seconds?|secs?|s|minutes?|mins?|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)\s+ago\b/iu;
const NOW_WORDS = /^(?:(?:posted|active|updated)\s+)?(?:just now|just posted|right now|today|now)$/iu;
const YESTERDAY = /^(?:(?:posted|active|updated)\s+)?yesterday$/iu;
const ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/u;
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\.?,?(?:\\s+(\\d{4}))?\\b`, "iu");
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "iu");
const NUMERIC = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/u;

/** The instant a value states, in epoch milliseconds, or `undefined` for a value that states no date. */
export function readAutomationStudioRecordDate(text: string, now: number): number | undefined {
  const relative = RELATIVE.exec(text);
  if (relative !== null) {
    const amount = /^\d/u.test(relative[1]!) ? Number(relative[1]) : 1;
    const unit = relative[2]!.toLowerCase();
    const ms = UNIT_MS.find(([pattern]) => pattern.test(unit))?.[1];
    return ms === undefined ? undefined : now - amount * ms;
  }
  const whole = collapsedText(text);
  if (YESTERDAY.test(whole)) return now - DAY_MS;
  const iso = ISO.exec(text);
  if (iso !== null) return utc(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0));
  const dayMonth = DAY_MONTH.exec(text);
  if (dayMonth !== null) return withYear(dayMonth[3], monthOf(dayMonth[2]!), Number(dayMonth[1]), now);
  const monthDay = MONTH_DAY.exec(text);
  if (monthDay !== null) return withYear(monthDay[3], monthOf(monthDay[1]!), Number(monthDay[2]), now);
  const numeric = NUMERIC.exec(text);
  if (numeric !== null) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    return first > 12 ? utc(Number(numeric[3]), second, first) : utc(Number(numeric[3]), first, second);
  }
  if (NOW_WORDS.test(whole)) return now;
  return undefined;
}

/** A month and day with the year written, or, with none, the latest such date not after `now` plus a day. */
function withYear(year: string | undefined, month: number, day: number, now: number): number | undefined {
  if (year !== undefined) return utc(Number(year), month, day);
  const thisYear = new Date(now).getUTCFullYear();
  const date = utc(thisYear, month, day);
  if (date === undefined) return undefined;
  return date > now + DAY_MS ? utc(thisYear - 1, month, day) : date;
}

function utc(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): number | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const time = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return Number.isFinite(time) ? time : undefined;
}

function monthOf(word: string): number {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(word.slice(0, 3).toLowerCase()) + 1;
}
