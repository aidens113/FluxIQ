import { expect, it } from "vitest";
import type { ObservationEntry, StateCheckpointEntry } from "@fluxiq/contracts/recording";
import { recordingTimelineForProposalMapping } from "../timeline.ts";

it("binds only the two historical client transport names and omits checkpoints without the broader payload-state heuristic", () => {
  const base = { recordingId: "recording.actual", timestamp: 1, monotonicOffsetMs: 0, sequence: 0, sourceId: "source.actual" };
  const observation = (id: string, observationType: string): ObservationEntry => ({ ...base, id, type: "observation", observationType, payload: { state: { privateToNormalizer: true } } });
  const entries: Array<ObservationEntry | StateCheckpointEntry> = [observation("snapshot", "client.state_snapshot"), observation("update", "client.state_update"), observation("custom", "domain.custom"), observation("similar", "client.state_snapshot.extra"), { ...base, id: "checkpoint", type: "state_checkpoint", state: { timestamp: 1, namespaces: {} } }];
  const bytes = JSON.stringify(entries);
  expect(recordingTimelineForProposalMapping(entries).map((entry) => entry.id)).toEqual(["custom", "similar"]);
  expect(JSON.stringify(entries)).toBe(bytes);
});
