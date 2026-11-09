// The asserted string formats of the type subset. Pure checks with no dependency, the
// same in a browser and in Node.

import type { JsonTypeFormat } from "./type-schema.ts";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/u;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/u;
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

/** True when `value` is written in `format` (see `JSON_TYPE_FORMATS`). */
export function matchesJsonTypeFormat(format: JsonTypeFormat, value: string): boolean {
  switch (format) {
    case "date":
      return isDate(value);
    case "date-time":
      return isDateTime(value);
    case "uri":
      return isUri(value);
    case "email":
      return value.length <= 254 && EMAIL.test(value);
  }
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return day <= days;
}

function isDate(value: string): boolean {
  const match = DATE.exec(value);
  return match !== null && isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isDateTime(value: string): boolean {
  const match = DATE_TIME.exec(value);
  if (match === null) return false;
  if (!isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) return false;
  // RFC 3339 allows a leap second, 60.
  if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 60) return false;
  if (match[7] === undefined) return true;
  return Number(match[8]) <= 23 && Number(match[9]) <= 59;
}

function isUri(value: string): boolean {
  return value.length <= 8192 && SCHEME.test(value) && URL.canParse(value);
}
