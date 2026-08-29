import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inspectorPanelKinds } from "./inspector/panel-registry";
import { buildRecordingTimeline } from "./recordings/recording-model";
import { queryRecordingPage } from "./recordings/recording-queries";
import { repairRecordingStateIndex } from "./recordings/recording-commands";
import { appendRecordingNote } from "./recordings/recording-notes";
import { appendRecordingMarker } from "./recordings/recording-markers";

describe("Automation Studio Phase 10F boundaries", () => {
  it("registers every current inspector selection kind exactly once", () => {
    expect(new Set(inspectorPanelKinds).size).toBe(inspectorPanelKinds.length);
    expect(inspectorPanelKinds).toEqual(expect.arrayContaining(["flow", "node", "editor-node", "recording", "timeline", "state", "workspace"]));
  });

  it("keeps recording models React-free and stable-sorts without mutating input", () => {
    const entries = [
      { id: "second", sequence: 2, monotonicOffsetMs: 25 },
      { id: "first", sequence: 1, monotonicOffsetMs: 10 }
    ];
    expect(buildRecordingTimeline(entries).map((step) => [step.entry.id, step.waitMs])).toEqual([["first", 10], ["second", 15]]);
    expect(entries[0]?.id).toBe("second");
    expect(readFileSync(new URL("./recordings/recording-model.ts", import.meta.url), "utf8")).not.toContain('from "react"');
  });

  it("routes recording data operations through dedicated API functions", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: {} });
    await queryRecordingPage({ post }, { projectId: "project.one", limit: 25, offset: 50 });
    await repairRecordingStateIndex({ post }, { projectId: "project.one", recordingId: "recording.one", authorizationPin: "1234" });
    expect(post).toHaveBeenNthCalledWith(1, "list-recordings", { projectId: "project.one", summaries: true, limit: 25, offset: 50 });
    expect(post).toHaveBeenNthCalledWith(2, "repair-recording-state-index", { projectId: "project.one", recordingId: "recording.one", mode: "write", authorizationPin: "1234" });
  });

  it("keeps note and marker command details in their recording-owned modules", async () => {
    const writeNote = vi.fn().mockResolvedValue(undefined);
    const writeMarker = vi.fn().mockResolvedValue(undefined);
    await appendRecordingNote(writeNote, { recordingId: "recording.one", linkedEntryId: "entry.one", text: "  Useful note  ", authorizationPin: "1234" });
    await appendRecordingMarker(writeMarker, { recordingId: "recording.one", linkedEntryId: "entry.one", monotonicOffsetMs: 25, label: "  Checkpoint  ", authorizationPin: "1234" });
    expect(writeNote).toHaveBeenCalledWith("recording.one", "entry.one", "Useful note", "1234");
    expect(writeMarker).toHaveBeenCalledWith("recording.one", "entry.one", 25, "Checkpoint", "1234");
  });
  it("removes resolved compatibility barrels and cross-domain private imports", () => {
    const clientView = readFileSync(new URL("./clients/ClientGatewayView.tsx", import.meta.url), "utf8");
    expect(existsSync(new URL("./views/TimelineView.tsx", import.meta.url))).toBe(false);
    expect(existsSync(new URL("./views/ClientViews.tsx", import.meta.url))).toBe(false);
    expect(clientView).not.toContain("../views/");
  });
});