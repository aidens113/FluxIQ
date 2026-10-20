import { describe, expect, it } from "vitest";
import { clientGatewayOutboxDeliverable } from "../index.ts";
import { binding, entry, recordingEvent, stateUpdate, stopRecording } from "./messages.ts";

describe("clientGatewayOutboxDeliverable", () => {
  const current = binding("lineage.1", "project.1", "rec.current");

  it("drops entries from another lineage", () => {
    const own = entry(stateUpdate(), binding("lineage.1", "project.1"));
    const stale = entry(stateUpdate(), binding("lineage.0", "project.1"));
    expect(clientGatewayOutboxDeliverable([stale, own], current)).toEqual({ deliver: [own], dropped: [stale] });
  });

  it("drops entries queued under another project, including no project against a project", () => {
    const own = entry(stateUpdate(), binding("lineage.1", "project.1"));
    const other = entry(stateUpdate(), binding("lineage.1", "project.2"));
    const none = entry(stateUpdate(), binding("lineage.1", null));
    expect(clientGatewayOutboxDeliverable([other, own, none], current)).toEqual({ deliver: [own], dropped: [other, none] });
  });

  it("matches no project against no project", () => {
    const none = entry(stateUpdate(), binding("lineage.1", null));
    expect(clientGatewayOutboxDeliverable([none], binding("lineage.1", null, null)).deliver).toEqual([none]);
  });

  it("delivers entries of the current recording and of no recording", () => {
    const ofCurrent = entry(recordingEvent("rec.current"), binding("lineage.1", "project.1", "rec.current"));
    const ofNone = entry(stateUpdate(), binding("lineage.1", "project.1", null));
    expect(clientGatewayOutboxDeliverable([ofCurrent, ofNone], current)).toEqual({ deliver: [ofCurrent, ofNone], dropped: [] });
  });

  it("drops entries of another recording that did not end in the queue", () => {
    const other = entry(recordingEvent("rec.other"), binding("lineage.1", "project.1", "rec.other"));
    expect(clientGatewayOutboxDeliverable([other], current)).toEqual({ deliver: [], dropped: [other] });
  });

  it("drops another recording's entries when there is no current recording", () => {
    const other = entry(recordingEvent("rec.other"), binding("lineage.1", "project.1", "rec.other"));
    expect(clientGatewayOutboxDeliverable([other], binding("lineage.1", "project.1", null)).dropped).toEqual([other]);
  });

  it("delivers a recording that ended while the socket was down, with its stop", () => {
    const step = entry(recordingEvent("rec.ended"), binding("lineage.1", "project.1", "rec.ended"));
    const stop = entry(stopRecording("rec.ended"), binding("lineage.1", "project.1", "rec.ended"));
    expect(clientGatewayOutboxDeliverable([step, stop], binding("lineage.1", "project.1", null)))
      .toEqual({ deliver: [step, stop], dropped: [] });
  });

  it("does not count a stop queued under another lineage or project as an ending", () => {
    const step = entry(recordingEvent("rec.ended"), binding("lineage.1", "project.1", "rec.ended"));
    const staleStop = entry(stopRecording("rec.ended"), binding("lineage.0", "project.1", "rec.ended"));
    const otherProjectStop = entry(stopRecording("rec.ended"), binding("lineage.1", "project.2", "rec.ended"));
    expect(clientGatewayOutboxDeliverable([step, staleStop, otherProjectStop], current))
      .toEqual({ deliver: [], dropped: [step, staleStop, otherProjectStop] });
  });

  it("keeps queue order across kept and dropped entries", () => {
    const a = entry(stateUpdate(), binding("lineage.1", "project.1"));
    const b = entry(recordingEvent("rec.other"), binding("lineage.1", "project.1", "rec.other"));
    const c = entry(recordingEvent("rec.current"), binding("lineage.1", "project.1", "rec.current"));
    const d = entry(recordingEvent("rec.ended"), binding("lineage.1", "project.1", "rec.ended"));
    const e = entry(stateUpdate(), binding("lineage.0", "project.1"));
    const f = entry(stopRecording("rec.ended"), binding("lineage.1", "project.1", "rec.ended"));
    expect(clientGatewayOutboxDeliverable([a, b, c, d, e, f], current)).toEqual({ deliver: [a, c, d, f], dropped: [b, e] });
  });
});
