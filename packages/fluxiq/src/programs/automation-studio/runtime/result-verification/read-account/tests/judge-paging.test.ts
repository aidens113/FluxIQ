import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioResultSummaryWithPagingWords } from "../index.ts";

const read = (overrides: Partial<AutomationStudioResultReadAccount> = {}): AutomationStudioResultReadAccount => ({
  nodeId: "read", definitionId: "opaque.read", pagesRead: 5, pageLimit: 5, stop: "control_disabled", truncated: false, kept: 13, ...overrides
});
const summary = (reads?: AutomationStudioResultReadAccount[]): AutomationStudioRunResultSummary => ({
  schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 13, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [], flowShape: [], withheld: false,
  ...(reads ? { reads } : {})
});
const projected = (value: AutomationStudioResultReadAccount) => automationStudioResultSummaryWithPagingWords(summary([value])).reads?.[0] as AutomationStudioResultReadAccount & { paging: string };

describe("the judge's paging evidence copy", () => {
  it("preserves the original account and only removes the bound beside a consistent observed end", () => {
    const original = summary([read()]);
    const before = structuredClone(original);
    const next = automationStudioResultSummaryWithPagingWords(original);
    expect(next.reads?.[0]?.pageLimit).toBeUndefined();
    expect(projected(read()).paging).toContain("every page (5)");
    expect(projected(read()).paging).toContain("There is no further page");
    expect(original).toEqual(before);
    expect(original.reads?.[0]?.pageLimit).toBe(5);
  });

  it.each(["no_following_page", "scrolled_to_end", "control_absent"])("uses the shared observed end wording for %s", (stop) => {
    expect(projected(read({ stop })).paging).toContain("There is no further page");
    expect(projected(read({ stop })).pageLimit).toBeUndefined();
  });

  it("keeps the actual bound and warning when it cut the read short", () => {
    const next = projected(read({ stop: "page_limit", truncated: true }));
    expect(next.pageLimit).toBe(5);
    expect(next.paging).toContain("cut short");
    expect(next.paging).toContain("list may go on");
  });

  it.each([
    { stop: "rate_limited" },
    { stop: "unexpected_stop" },
    { stop: "control_disabled", truncated: true },
    { stop: "control_disabled", pagesRead: 6 },
    { stop: "control_disabled", pagesRead: 0 },
    { stop: "control_absent", pagesRead: 1 },
    { stop: "control_disabled", paginates: false }
  ])("does not claim all pages from uncertain or contradictory evidence %j", (overrides) => {
    const next = projected(read(overrides));
    expect(next.pageLimit).toBe(5);
    expect(next.paging.includes("every page")).toBe(false);
    expect(next.paging.includes("There is no further page")).toBe(false);
  });

  it.each([5, 2])("does not infer a recorded end when the stop field is absent (%i pages)", (pagesRead) => {
    const { stop: _stop, ...withoutStop } = read({ pagesRead });
    const next = projected(withoutStop);
    expect(next.pageLimit).toBe(5);
    expect(next.paging.includes("every page")).toBe(false);
    expect(next.paging.includes("There is no further page")).toBe(false);
  });

  it("adds no read when none was recorded", () => {
    const original = summary();
    expect(automationStudioResultSummaryWithPagingWords(original)).toBe(original);
  });
});
