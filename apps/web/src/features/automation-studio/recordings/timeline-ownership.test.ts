import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createRecordingActionPreviewIndex, createRecordingActionPreviewModel, projectRecordingActionPreview } from "./action-preview-model";
import { RecordingActionPreviewDock } from "./RecordingActionPreviewDock";
import {
  orderRecordingTimelineEntries,
  recordingTimelineStepsWindow
} from "./recording-model";

describe("Recording timeline ownership", () => {
  it("materializes only the requested timeline window", () => {
    const entries = Array.from({ length: 10_000 }, (_, index) => ({
      id: "entry." + String(index),
      type: "action",
      sequence: 10_000 - index,
      monotonicOffsetMs: (10_000 - index) * 10,
      payload: { expensive: true }
    }));
    const ordered = orderRecordingTimelineEntries(entries);
    const window = recordingTimelineStepsWindow(ordered, 4_000, 4_200);
    expect(window).toHaveLength(200);
    expect(window[0]?.entry.sequence).toBe(4_001);
    expect(window.at(-1)?.entry.sequence).toBe(4_200);
    expect(window.every((step) => step.waitMs === 10)).toBe(true);
  });

  it("builds a typed bounded dock preview without recording objects", () => {
    const entries = Array.from({ length: 10_000 }, (_, index) => ({
      id: "action." + String(index),
      type: index % 3 ? "action" : "observation",
      sequence: index
    }));
    const model = createRecordingActionPreviewModel(entries, "action.9998");
    expect(model.entries.length).toBeLessThanOrEqual(200);
    expect(model.total).toBe(6_666);
    expect(model.entries.some((entry) => entry.id === "action.9998")).toBe(true);
    expect(model).not.toHaveProperty("recording");
  });

  it("reuses the sorted preview index and memoized projection identity", () => {
    const entries = Array.from({ length: 1_000 }, (_, index) => ({
      id: "action." + String(index),
      type: "action",
      sequence: 1_000 - index
    }));
    const index = createRecordingActionPreviewIndex(entries);
    const first = projectRecordingActionPreview(index, "action.10");
    const second = projectRecordingActionPreview(index, "action.900");
    expect(second.orderedEntryIds).toBe(first.orderedEntryIds);
    expect(second.total).toBe(1_000);
    expect(second.entries.some((entry) => entry.id === "action.900")).toBe(true);
    expect(projectRecordingActionPreview(index, "action.900")).toBe(second);
  });

  it("centers the selected action and keeps 100,000 entries to a 200-row model", () => {
    const entries = Array.from({ length: 100_000 }, (_, sequence) => ({
      id: "action." + String(sequence), type: "action", sequence
    }));
    const index = createRecordingActionPreviewIndex(entries);
    const model = projectRecordingActionPreview(index, "action.50000");
    expect(model).toMatchObject({ start: 49_900, end: 50_100, total: 100_000, selectedIndex: 50_000 });
    expect(model.entries).toHaveLength(200);
    expect(model.entries[100]?.id).toBe("action.50000");
  });

  it("renders a directly composed empty model without rebuilding it", () => {
    const model = createRecordingActionPreviewModel([]);
    const html = renderToStaticMarkup(createElement(RecordingActionPreviewDock, {
      model,
      onSelectAction: () => undefined
    }));
    expect(html).toContain("No actions yet");
    expect(html).toContain("State observations stay in the full timeline view.");
  });

  it("keeps preview composition and rendering owned by Recording", () => {
    const dock = readFileSync(new URL("./RecordingActionPreviewDock.tsx", import.meta.url), "utf8");
    expect(dock).toContain("useMemo");
    expect(dock).toContain("projectRecordingActionPreview");
    expect(dock).not.toContain("props.selectedRecording");
    expect(existsSync(new URL("../views/TimelineDock.tsx", import.meta.url))).toBe(false);
  });

  it("keeps timeline controllers behind Recording-owned data ports", () => {
    const list = readFileSync(new URL("./useRecordingListController.ts", import.meta.url), "utf8");
    const actions = readFileSync(new URL("./useRecordingActionController.ts", import.meta.url), "utf8");
    const view = readFileSync(new URL("./RecordingTimelineView.tsx", import.meta.url), "utf8");
    expect(list).not.toContain("useProgramApi");
    expect(actions).not.toContain("useProgramApi");
    expect(view).not.toContain("/program-api");
    expect(view).toContain("useRecordingViewDataPort");
  });
});
