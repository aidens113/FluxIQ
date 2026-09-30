import { describe, expect, it } from "vitest";
import { appendRecordingEntry, appendRecordingNote, createRecordingSession, finalizeRecordingSession, type RecordingSession } from "../../../../model/index.ts";
import { removeRecordingEntriesByEventId } from "../entry-removal.ts";

// `entry-removal.ts`: undoing one captured step of a recording that is still open.

function observation(recording: RecordingSession, eventId: string | undefined, id: string): RecordingSession {
  return appendRecordingEntry(recording, {
    type: "observation",
    id,
    observationType: "input.action",
    payload: { step: id },
    timestamp: 1_000,
    metadata: { policyEligible: false, ...(eventId !== undefined ? { eventId } : {}) }
  });
}

function recordingWithSteps(): RecordingSession {
  let recording = createRecordingSession({ recordingId: "recording.one", startedAt: 0, initialState: { timestamp: 0, namespaces: {} } });
  recording = observation(recording, "event.a", "entry.a1");
  recording = observation(recording, "event.b", "entry.b1");
  recording = observation(recording, "event.b", "entry.b2");
  recording = observation(recording, undefined, "entry.bare");
  return appendRecordingNote(recording, { text: "that click", source: "typed", scope: "action", linkedEntryIds: ["entry.b1", "entry.a1"] });
}

describe("removing a recorded step by its event id", () => {
  it("removes every entry from that event and nothing else, keeping the others' sequences", () => {
    const before = recordingWithSteps();
    const { recording, removedCount } = removeRecordingEntriesByEventId(before, "event.b");

    expect(removedCount).toBe(2);
    expect(recording.timeline.map((entry) => entry.id)).toEqual(["entry.a1", "entry.bare", "entry.note.1"]);
    expect(recording.timeline.map((entry) => entry.sequence)).toEqual(before.timeline.filter((entry) => !["entry.b1", "entry.b2"].includes(entry.id)).map((entry) => entry.sequence));
  });

  it("stops a note pointing at a removed entry, and drops the link list once nothing is left in it", () => {
    const once = removeRecordingEntriesByEventId(recordingWithSteps(), "event.b").recording;
    expect(once.notes[0]?.linkedEntryIds).toEqual(["entry.a1"]);

    const twice = removeRecordingEntriesByEventId(once, "event.a").recording;
    expect(twice.notes[0]).not.toHaveProperty("linkedEntryIds");
    expect(twice.notes[0]?.text).toBe("that click");
  });

  it("answers an event nothing was recorded from with the same recording and a count of zero", () => {
    const before = recordingWithSteps();
    const result = removeRecordingEntriesByEventId(before, "event.none");
    expect(result.removedCount).toBe(0);
    expect(result.recording).toBe(before);
  });

  it("does not modify the recording it was given", () => {
    const before = recordingWithSteps();
    const snapshot = structuredClone(before);
    removeRecordingEntriesByEventId(before, "event.b");
    expect(before).toEqual(snapshot);
  });

  it("refuses a finalized recording", () => {
    const finalized = finalizeRecordingSession(recordingWithSteps(), 5_000);
    expect(() => removeRecordingEntriesByEventId(finalized, "event.b")).toThrow("A finalized recording's entries can no longer be removed.");
  });

  it("refuses a blank event id rather than matching entries that have none", () => {
    expect(() => removeRecordingEntriesByEventId(recordingWithSteps(), "  ")).toThrow("Removing a recording entry needs the event ID it was recorded from.");
  });
});
