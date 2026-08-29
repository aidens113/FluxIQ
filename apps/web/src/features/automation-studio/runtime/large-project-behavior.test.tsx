import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { RunList } from "./RunList";
import type { RunHistoryQuery } from "./run-queries";

const query = { search: "", status: "", sort: "updated", direction: "desc", limit: 25 } satisfies RunHistoryQuery;
const handlers = {
  onOpenLog: () => undefined, onPage: () => undefined, onQuery: () => undefined, onRetry: () => undefined,
  onSearchDraft: () => undefined, onSubmitSearch: () => undefined
};

function renderRunList(overrides: Partial<Parameters<typeof RunList>[0]> = {}) {
  return renderToStaticMarkup(createElement(RunList, {
    sessions: [], page: { limit: 25, offset: 0, total: 0 }, query, searchDraft: "", loading: false, error: "",
    ...handlers, ...overrides
  }));
}

describe("Runtime large-project behavior", () => {
  it("renders explicit empty, loading, and error states", () => {
    expect(renderRunList()).toContain("No runtime sessions have been started");
    expect(renderRunList({ loading: true })).toContain("Loading runs...");
    const error = renderRunList({ error: "Run history is forbidden." });
    expect(error).toContain('role="alert"');
    expect(error).toContain("Run history is forbidden.");
    expect(error).toContain("Retry");
  });

  it("renders only the SQL-sized run page from a thousands-run fixture", () => {
    const fixture = createLargeAutomationStudioProjectFixture();
    const sessions = fixture.runs.slice(0, query.limit);
    const html = renderRunList({ sessions, page: { limit: query.limit, offset: 0, total: fixture.runs.length } });
    expect((html.match(/automation-runtime-run-row/g) ?? []).length).toBe(25);
    expect(html).toContain("1-25 of 2048 runs");
    expect(html).toContain("run.00024");
    expect(html).not.toContain("run.00025");
  });
});
