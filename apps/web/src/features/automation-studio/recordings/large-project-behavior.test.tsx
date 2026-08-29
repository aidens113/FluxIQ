import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { repairRecordingStateIndex } from "./recording-commands";
import { RecordingListView } from "./RecordingListView";
import { initialRecordingPage, timelineEventWindow } from "./recording-model";

function renderList(overrides: Partial<Parameters<typeof RecordingListView>[0]> = {}) {
  return renderToStaticMarkup(createElement(RecordingListView, {
    error: "", loading: false, page: { recordings: [], limit: 25, offset: 0, total: 0 },
    onOpen: () => undefined, onPage: () => undefined, onRetry: () => undefined, ...overrides
  }));
}

describe("Recording large-project behavior", () => {
  it("renders empty, loading, and error states", () => {
    expect(renderList()).toContain("No recordings yet");
    expect(renderList({ loading: true })).toContain("Loading recordings...");
    expect(renderList({ error: "Recording access denied." })).toContain("Recording access denied.");
  });

  it("bounds list pages and timeline windows for thousands of records", () => {
    const fixture = createLargeAutomationStudioProjectFixture();
    const page = initialRecordingPage(fixture.recordings);
    const html = renderList({ page });
    expect(page.recordings).toHaveLength(25);
    expect((html.match(/<button/g) ?? []).length).toBe(27);
    expect(html).toContain("1-25 of 2048");
    expect(html).not.toContain("recording.00025");
    expect(timelineEventWindow(fixture.actions.length, 4_317)).toEqual({ start: 4_200, end: 4_400 });
  });

  it("preserves protected recording command failures", async () => {
    const api = { post: vi.fn().mockResolvedValue({ ok: false, error: "recording.manage permission required" }) };
    await expect(repairRecordingStateIndex(api, {
      projectId: "project.large", recordingId: "recording.00000", authorizationPin: "1234"
    })).resolves.toEqual({ ok: false, error: "recording.manage permission required" });
  });
});
