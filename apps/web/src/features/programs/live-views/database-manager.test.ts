import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatGrantCountdown } from "./database-manager";

describe("DatabaseManagerLive contract", () => {
  it("formats expiring grants without negative time", () => {
    expect(formatGrantCountdown(65_000, 0)).toBe("1:05");
    expect(formatGrantCountdown(0, 1_000)).toBe("0:00");
  });

  it("uses bounded server pages and separate record detail", () => {
    const source = readFileSync(new URL("./database-manager.tsx", import.meta.url), "utf8");
    expect(source).toContain('limit: 50');
    expect(source).toContain('offset: page.offset');
    expect(source).toContain('search,');
    expect(source).toContain('sort,');
    expect(source).toContain('"get-record"');
    expect(source).toContain('"authorize-store"');
    expect(source).not.toContain('JSON.stringify(record.data ?? {})');
  });
});