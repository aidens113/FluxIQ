import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordingDialogCopy, recordingListPageRange, timelineEventWindow, timelineKeyboardTargetIndex } from "../recordings/recording-model";
import { recordingActionPreviewTargetIndex as bottomTimelineTargetIndex, recordingActionPreviewWindow as bottomTimelineWindow } from "../recordings";

describe("recordingListPageRange", () => {
  it("reports empty, first, and partial final pages consistently", () => {
    expect(recordingListPageRange({ recordings: [], limit: 25, offset: 0, total: 0 })).toEqual({ start: 0, end: 0, previousOffset: 0, nextOffset: 25, pageNumber: 0, pageCount: 0 });
    expect(recordingListPageRange({ recordings: Array(25), limit: 25, offset: 0, total: 61 })).toMatchObject({ start: 1, end: 25, previousOffset: 0, nextOffset: 25, pageNumber: 1, pageCount: 3 });
    expect(recordingListPageRange({ recordings: Array(11), limit: 25, offset: 50, total: 61 })).toMatchObject({ start: 51, end: 61, previousOffset: 25, nextOffset: 75, pageNumber: 3, pageCount: 3 });
  });

  it("moves event focus with arrows and boundaries", () => {
    expect(timelineKeyboardTargetIndex("ArrowRight", -1, 4)).toBe(0);
    expect(timelineKeyboardTargetIndex("ArrowRight", 1, 4)).toBe(2);
    expect(timelineKeyboardTargetIndex("ArrowLeft", 0, 4)).toBe(0);
    expect(timelineKeyboardTargetIndex("Home", 3, 4)).toBe(0);
    expect(timelineKeyboardTargetIndex("End", 0, 4)).toBe(3);
    expect(timelineKeyboardTargetIndex("Tab", 1, 4)).toBeNull();
    expect(timelineKeyboardTargetIndex("ArrowRight", 0, 0)).toBeNull();
  });

  it("defines contextual in-product recording actions without native prompts", () => {
    expect(recordingDialogCopy("rename")).toMatchObject({ title: "Rename recording", fieldLabel: "Name" });
    expect(recordingDialogCopy("note")).toMatchObject({ title: "Add note", fieldLabel: "Note" });
    expect(recordingDialogCopy("marker")).toMatchObject({ title: "Add marker", fieldLabel: "Label" });
    expect(recordingDialogCopy("finalize").description).toContain("stable Flow evidence");
    expect(recordingDialogCopy("repair").action).toBe("Repair index");
    expect(recordingDialogCopy("delete").description).toContain("Permanently remove");
    const timelineSource = readFileSync(new URL("../recordings/RecordingTimelineView.tsx", import.meta.url), "utf8");
    const actionSource = readFileSync(new URL("../recordings/useRecordingActionController.ts", import.meta.url), "utf8");
    expect(timelineSource).not.toContain("window.prompt");
    expect(timelineSource).not.toContain("window.confirm");
    expect(actionSource).not.toContain("window.prompt");
    expect(actionSource).not.toContain("window.confirm");
  });

  it("keeps bottom preview keyboard movement aligned with the full timeline", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(bottomTimelineTargetIndex(key, 2, 5)).toBe(timelineKeyboardTargetIndex(key, 2, 5));
    }
    expect(bottomTimelineTargetIndex("ArrowRight", -1, 3)).toBe(0);
    expect(bottomTimelineTargetIndex("ArrowLeft", 0, 3)).toBe(0);
    expect(bottomTimelineTargetIndex("End", 0, 0)).toBeNull();
  });

  it("keeps recordings as evidence and legacy generators out of the normal path", () => {
    const clientController = readFileSync(new URL("../clients/useClientGatewayController.ts", import.meta.url), "utf8");
    const rendererSource = readFileSync(new URL("./Renderer.tsx", import.meta.url), "utf8");
    const recoverySource = readFileSync(new URL("./RetiredViewRecovery.tsx", import.meta.url), "utf8");
    expect(clientController).toContain("stopped and is available as Flow evidence");
    expect(rendererSource).not.toContain("onOpenProposalGenerator");
    expect(recoverySource).toContain("Select a Flow, then open Adaptations");
    expect(recoverySource).not.toContain("Create direct or assisted proposals from recordings.");
  });

  it("bounds a 10,000-event timeline while retaining selected context", () => {
    expect(timelineEventWindow(10_000, 0)).toEqual({ start: 0, end: 200 });
    expect(timelineEventWindow(10_000, 9_999)).toEqual({ start: 9_800, end: 10_000 });
    expect(timelineEventWindow(10_050, 10_000)).toEqual({ start: 10_000, end: 10_050 });
    expect(bottomTimelineWindow(10_000, 9_999, 200)).toEqual({ start: 9_800, end: 10_000 });
    expect(bottomTimelineWindow(10_000, 5_000, 200)).toEqual({ start: 4_900, end: 5_100 });
    const timelineSource = readFileSync(new URL("../recordings/RecordingTimelineView.tsx", import.meta.url), "utf8");
    const dockSource = readFileSync(new URL("../recordings/RecordingActionPreviewDock.tsx", import.meta.url), "utf8");
    const previewSource = readFileSync(new URL("../recordings/RecordingActionPreview.tsx", import.meta.url), "utf8");
    expect(timelineSource).not.toContain("{timelineSteps.map");
    expect(timelineSource).toContain("{visibleTimelineSteps.map");
    expect(dockSource).toContain("function RecordingActionPreviewDock");
    expect(dockSource).toContain("useMemo");
    expect(previewSource).toContain("{props.model.entries.map");
  });
});
