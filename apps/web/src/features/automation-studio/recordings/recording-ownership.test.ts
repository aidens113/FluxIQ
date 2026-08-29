import { describe, expect, it, vi } from "vitest";
import { recordingDirectoryWindow, recordingTimelineTracks } from "./recording-directory-model";
import { buildRecordingEventInspectorSections } from "./recording-event-format";
import { queryRecordingPage } from "./recording-queries";

describe("Recording ownership models", () => {
  it("loads SQL-paged summaries without hydrating recording detail", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { recordings: [], page: { limit: 25, offset: 50, total: 2000 } } });
    await queryRecordingPage({ post }, { projectId: "project.1", limit: 25, offset: 50 });
    expect(post).toHaveBeenCalledWith("list-recordings", {
      projectId: "project.1",
      summaries: true,
      limit: 25,
      offset: 50
    });
  });

  it("bounds directory and track output while retaining the selected recording", () => {
    const recordings = Array.from({ length: 2_000 }, (_, index) => ({ recordingId: `recording.${index}` }));
    const entries = Array.from({ length: 4_000 }, (_, index) => ({ id: `entry.${index}`, type: index % 2 ? "action" : "note" }));
    const directory = recordingDirectoryWindow(recordings, "recording.1999");
    const tracks = recordingTimelineTracks(entries, ["action", "note"]);

    expect(directory).toHaveLength(100);
    expect(directory.at(-1)?.recordingId).toBe("recording.1999");
    expect(tracks.map((track) => track.entries.length)).toEqual([200, 200]);
    expect(tracks.map((track) => track.total)).toEqual([2000, 2000]);
  });

  it("builds detail only for the selected event and its immediate neighbors", () => {
    const entries = Array.from({ length: 1_000 }, (_, index) => ({
      id: `entry.${index}`,
      sequence: index,
      monotonicOffsetMs: index * 10,
      type: "action",
      actionType: "click"
    }));
    const sections = buildRecordingEventInspectorSections(entries[500], entries, { recordingId: "recording.1" });
    expect(sections[0]?.rows).toContainEqual(["Sequence", "501 of 1000"]);
    expect(sections[1]?.rows).toContainEqual(["Gap before", "10ms"]);
    expect(sections).toHaveLength(4);
  });
});