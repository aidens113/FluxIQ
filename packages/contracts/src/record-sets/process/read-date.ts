// The instant a text value states (P7), as the downstream web domain's sort
// reads it, kept equal to it by `AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES`.
//
// A date is relative to `now` ("3 days ago", "30+ days ago", "an hour ago",
// "yesterday", "just posted") or absolute ("2026-09-12", "12 Sep 2026",
// "Sep 12", "13/02/2026"). A month and day with no year is the occurrence
// nearest `now`, within six months either way: one ahead of `now` is this
// year's or next year's, never last year's (supervisor, t510; until then it was
// the latest not after `now` plus a day, which put an end date a week ahead in
// the year before). A numeric date is day first only when its first
// number cannot be a month. "today" and "now" count only as the whole value,
// since "Apply today" is not a date. Absolute dates are read as UTC.
//
// A date keeps the time of day written with it ("22 Sep, 14:00", "Sep 12 at
// 2:30 pm"), and "today", "tomorrow" or "yesterday" with a time is that time on
// that day; a time alone states no date. A time left ("1d 0h left", "5h 12m
// left", "3 days remaining", "ends in 45 min") is the instant it runs out:
// `now` plus the time left. Until t510 the time of day was dropped, so values on
// one day kept the order they were read in, and a time left stated no date and
// was read as its first number, which put "5h 12m left" after "1d 0h left".

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
/**
 * A compact age as social pages print it: "1d", "3h", "2w", "45m", "45min", "5s",
 * "1mo", "1y", with an optional "ago" and "Posted" style prefix. It must be the
 * whole value, so "Apply in 3d" and "Size 5s" state none, and a bare number
 * does too. A bare `m` is minutes ("1mo" is the month); a fraction is allowed.
 */
const COMPACT_AGE = /^(?:(?:posted|active|updated)\s+)?(\d+(?:\.\d+)?)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|w|wk|wks|mo|mos|y|yr|yrs)(?:\s+ago)?$/iu;
const COMPACT_AGE_UNIT: Readonly<Record<string, number>> = {
  s: 1_000, sec: 1_000, secs: 1_000,
  m: 60_000, min: 60_000, mins: 60_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000,
  d: DAY_MS,
  w: 7 * DAY_MS, wk: 7 * DAY_MS, wks: 7 * DAY_MS,
  mo: 30 * DAY_MS, mos: 30 * DAY_MS,
  y: 365 * DAY_MS, yr: 365 * DAY_MS, yrs: 365 * DAY_MS
};
const NOW_WORDS =/^(?:(?:posted|active|updated)\s+)?(?:just now|just posted|right now|today|now)$/iu;
const YESTERDAY = /^(?:(?:posted|active|updated)\s+)?yesterday$/iu;
const ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/u;
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\.?,?(?:\\s+(\\d{4}))?\\b`, "iu");
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "iu");
const NUMERIC = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/u;

/** A time of day: `14:00`, `2:30 pm`, `9am`. A bare hour counts only with am or pm. */
const TIME = /\b(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*([ap])\.?m\b\.?|\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/iu;
/** A day said in words, read only beside a time. */
const DAY_WORD = /\b(yesterday|today|tomorrow)\b/iu;
const DAY_WORD_OFFSET: Readonly<Record<string, number>> = { yesterday: -1, today: 0, tomorrow: 1 };

/** One part of a time left: an amount and its unit. A bare `m` is minutes here; months are not a time left. */
const LEFT_PART = String.raw`\d+(?:\.\d+)?\s*(?:seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w)\b`;
const LEFT_PARTS = String.raw`${LEFT_PART}(?:[\s,]+(?:and\s+)?${LEFT_PART})*`;
/** A time left, said after its parts ("2d 4h left", "3 days remaining") or before them ("ends in 45 min"). */
const TIME_LEFT = new RegExp(String.raw`\b(${LEFT_PARTS})\s+(?:left|remaining|to go)\b|\b(?:ends?|ending|closes?|closing|expires?)\s+in\s+(${LEFT_PARTS})`, "iu");
const LEFT_PART_EACH = /(\d+(?:\.\d+)?)\s*([a-z]+)/giu;

/** The instant a value states, in epoch milliseconds, or `undefined` for a value that states no date. */
export function readAutomationStudioRecordDate(text: string, now: number): number | undefined {
  const relative = RELATIVE.exec(text);
  if (relative !== null) {
    const amount = /^\d/u.test(relative[1]!) ? Number(relative[1]) : 1;
    const unit = relative[2]!.toLowerCase();
    const ms = UNIT_MS.find(([pattern]) => pattern.test(unit))?.[1];
    return ms === undefined ? undefined : now - amount * ms;
  }
  const compact = COMPACT_AGE.exec(collapsedText(text));
  if (compact !== null) return now - Number(compact[1]) * COMPACT_AGE_UNIT[compact[2]!.toLowerCase()]!;
  const left = TIME_LEFT.exec(text);
  if (left !== null) {
    const ms = timeLeftMs(left[1] ?? left[2]!);
    return ms === undefined ? undefined : now + ms;
  }
  const whole = collapsedText(text);
  if (YESTERDAY.test(whole)) return now - DAY_MS;
  const iso = ISO.exec(text);
  if (iso !== null) return utc(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0));
  const time = timeOfDayMs(text);
  if (time === null) return undefined;
  const day = dayOf(text, now);
  if (day !== undefined) return day + (time ?? 0);
  const dayWord = time === undefined ? null : DAY_WORD.exec(text);
  if (dayWord !== null) return startOfDay(now) + DAY_WORD_OFFSET[dayWord[1]!.toLowerCase()]! * DAY_MS + time!;
  if (NOW_WORDS.test(whole)) return now;
  return undefined;
}

/** The start of the day a month-and-day or numeric date states, or `undefined` for a value that states none. */
function dayOf(text: string, now: number): number | undefined {
  const dayMonth = DAY_MONTH.exec(text);
  if (dayMonth !== null) return withYear(dayMonth[3], monthOf(dayMonth[2]!), Number(dayMonth[1]), now);
  const monthDay = MONTH_DAY.exec(text);
  if (monthDay !== null) return withYear(monthDay[3], monthOf(monthDay[1]!), Number(monthDay[2]), now);
  const numeric = NUMERIC.exec(text);
  if (numeric === null) return undefined;
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  return first > 12 ? utc(Number(numeric[3]), second, first) : utc(Number(numeric[3]), first, second);
}

/**
 * Milliseconds into the day of the time a value states: `undefined` when it
 * states none, and `null` when what it states is not a time of day ("25:00"),
 * which leaves the whole value unread rather than read as midnight.
 */
function timeOfDayMs(text: string): number | undefined | null {
  const time = TIME.exec(text);
  if (time === null) return undefined;
  const meridiem = time[4]?.toLowerCase();
  let hours = Number(time[1] ?? time[5]);
  const minutes = Number(time[2] ?? time[6] ?? 0);
  const seconds = Number(time[3] ?? time[7] ?? 0);
  if (meridiem !== undefined) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
  }
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1_000;
}

/** The milliseconds a time left adds up to. */
function timeLeftMs(parts: string): number | undefined {
  let total = 0;
  for (const [, amount, unit] of parts.matchAll(LEFT_PART_EACH)) {
    const word = unit!.toLowerCase();
    const ms = word === "m" ? 60_000 : UNIT_MS.find(([pattern]) => pattern.test(word))?.[1];
    if (ms === undefined) return undefined;
    total += Number(amount) * ms;
  }
  return total;
}

/** A month and day with the year written, or, with none, its occurrence nearest `now`: last year's, this year's or next year's. */
function withYear(year: string | undefined, month: number, day: number, now: number): number | undefined {
  if (year !== undefined) return utc(Number(year), month, day);
  const thisYear = new Date(now).getUTCFullYear();
  let nearest: number | undefined;
  for (const candidate of [thisYear - 1, thisYear, thisYear + 1]) {
    const date = utc(candidate, month, day);
    if (date !== undefined && (nearest === undefined || Math.abs(date - now) < Math.abs(nearest - now))) nearest = date;
  }
  return nearest;
}

function utc(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): number | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const time = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return Number.isFinite(time) ? time : undefined;
}

function startOfDay(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

function monthOf(word: string): number {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(word.slice(0, 3).toLowerCase()) + 1;
}

/** The units of a relative age that count whole days: a day-count age ("3 days ago", "2w", "1mo") names a day, not a moment in it. */
const DAY_COUNT_UNIT = /^(?:days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)$/iu;

/**
 * Whether a value that states a date states only a day, not a time of day
 * (G1): "2026-10-22", "22 Oct 2026", "Posted yesterday", "today", "3 days ago"
 * or "2w" name a day; "2026-10-22 09:00", "Today 09:00", "5 hours ago", "just
 * now", "45m" and a time left ("1d 0h left") name a moment. A value that reads
 * no date is not day-only (`undefined` from `readAutomationStudioRecordDate`).
 */
export function automationStudioRecordDateStatesOnlyDay(text: string, now: number): boolean {
  if (readAutomationStudioRecordDate(text, now) === undefined) return false;
  const relative = RELATIVE.exec(text);
  if (relative !== null) return DAY_COUNT_UNIT.test(relative[2]!);
  const compact = COMPACT_AGE.exec(collapsedText(text));
  if (compact !== null) return DAY_COUNT_UNIT.test(compact[2]!);
  if (TIME_LEFT.test(text)) return false;
  const whole = collapsedText(text);
  if (YESTERDAY.test(whole)) return true;
  if (ISO.exec(text)?.[4] !== undefined) return false;
  if (timeOfDayMs(text) !== undefined) return false;
  // What is left is a day, or "today" alone; "now" and "just posted" are moments.
  return !NOW_WORDS.test(whole) || /\btoday$/iu.test(whole);
}
