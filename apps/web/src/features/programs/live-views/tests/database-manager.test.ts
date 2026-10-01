import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatGrantCountdown } from "../database-manager";

describe("DatabaseManagerLive contract", () => {
  it("formats expiring grants without negative time", () => {
    expect(formatGrantCountdown(65_000, 0)).toBe("1:05");
    expect(formatGrantCountdown(0, 1_000)).toBe("0:00");
  });

  it("uses bounded server pages and separate record detail", () => {
    const source = readFileSync(new URL("../database-manager.tsx", import.meta.url), "utf8");
    const reads = readFileSync(new URL("../../database-records/useDatabaseRecords.ts", import.meta.url), "utf8");
    expect(reads).toContain('limit: 50');
    expect(reads).toContain('offset: requestedOffset');
    expect(reads).toContain('search: query.search');
    expect(reads).toContain('sort: query.sort');
    expect(reads).toContain('"get-record"');
    expect(source).toContain('"authorize-store"');
    expect(source).not.toContain('JSON.stringify(record.data ?? {})');
  });
});
