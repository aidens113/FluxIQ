// The asserted string formats.
import { describe, expect, it } from "vitest";
import { JSON_TYPE_SECRET_MIN_LENGTH, matchesJsonTypeFormat, validateJsonValue } from "../index.ts";

describe("matchesJsonTypeFormat", () => {
  it("checks date-time as RFC 3339, calendar and clock included", () => {
    expect(matchesJsonTypeFormat("date-time", "2026-11-09T14:30:00Z")).toBe(true);
    expect(matchesJsonTypeFormat("date-time", "2026-11-09t14:30:00.123+01:00")).toBe(true);
    expect(matchesJsonTypeFormat("date-time", "2016-12-31T23:59:60Z")).toBe(true);
    expect(matchesJsonTypeFormat("date-time", "2026-11-09 14:30:00Z")).toBe(false);
    expect(matchesJsonTypeFormat("date-time", "2026-11-09T24:00:00Z")).toBe(false);
    expect(matchesJsonTypeFormat("date-time", "2026-11-09T14:30:00")).toBe(false);
    expect(matchesJsonTypeFormat("date-time", "2026-02-30T00:00:00Z")).toBe(false);
  });

  it("checks date with leap years", () => {
    expect(matchesJsonTypeFormat("date", "2024-02-29")).toBe(true);
    expect(matchesJsonTypeFormat("date", "2026-02-29")).toBe(false);
    expect(matchesJsonTypeFormat("date", "2000-02-29")).toBe(true);
    expect(matchesJsonTypeFormat("date", "1900-02-29")).toBe(false);
    expect(matchesJsonTypeFormat("date", "2026-13-01")).toBe(false);
  });

  it("checks uri as absolute with a scheme and no whitespace", () => {
    expect(matchesJsonTypeFormat("uri", "https://market.example/item?id=1")).toBe(true);
    expect(matchesJsonTypeFormat("uri", "mailto:someone@example.com")).toBe(true);
    expect(matchesJsonTypeFormat("uri", "/relative/path")).toBe(false);
    expect(matchesJsonTypeFormat("uri", "https://a.example/a b")).toBe(false);
    expect(matchesJsonTypeFormat("uri", "market.example")).toBe(false);
  });

  it("checks email with a dotted domain", () => {
    expect(matchesJsonTypeFormat("email", "first.last+tag@mail.example.com")).toBe(true);
    expect(matchesJsonTypeFormat("email", "someone@localhost")).toBe(false);
    expect(matchesJsonTypeFormat("email", "a..b@example.com")).toBe(false);
    expect(matchesJsonTypeFormat("email", "no-at.example.com")).toBe(false);
  });
});

describe("the secret format", () => {
  it("takes any text of at least the minimum length, counted in characters", () => {
    expect(matchesJsonTypeFormat("secret", "a1b2")).toBe(true);
    expect(matchesJsonTypeFormat("secret", "a1b")).toBe(false);
    expect(matchesJsonTypeFormat("secret", "🔑🔑🔑🔑")).toBe(true);
    expect(JSON_TYPE_SECRET_MIN_LENGTH).toBe(4);
  });

  it("names why a short secret is refused", () => {
    const errors = validateJsonValue({ type: "string", format: "secret" }, "abc");
    expect(errors.map((error) => error.message)).toEqual([expect.stringContaining("at least 4 characters")]);
  });
});
