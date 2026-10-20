import { describe, expect, it } from "vitest";
import { deriveClientGatewayTraceEvent, deriveClientGatewayTraceManifest, isClientGatewayTraceLive } from "../index.ts";
import type { ClientGatewayTraceManifest } from "../index.ts";
import { TRACE_ID, newRecorder, textEvent } from "./trace-builders.ts";

describe("derived traces", () => {
  it("T24: a re-ingested trace is derived and cannot be read as live, even when relabelled live", async () => {
    const { recorder, store } = newRecorder();
    recorder.record(textEvent("{}"));
    const live = await recorder.close({ terminationReason: "completed", terminationDetail: null });
    expect(isClientGatewayTraceLive(live)).toBe(true);
    const exported = JSON.parse(JSON.stringify(live)) as ClientGatewayTraceManifest;
    const ingested = deriveClientGatewayTraceManifest(exported, "reingest");
    expect(ingested.origin).toEqual({ kind: "derived", derivation: "reingest", sourceTraceIds: [TRACE_ID] });
    expect(isClientGatewayTraceLive(ingested)).toBe(false);
    const [event] = await store.readEventRange(TRACE_ID, 1, 1);
    expect(deriveClientGatewayTraceEvent(event!).provenance).toEqual({ episodeId: "run-live-1", origin: "derived" });
  });

  it("T24: deriving a derived trace keeps it derived and keeps its original sources", () => {
    const { recorder } = newRecorder({}, { traceId: "replay-1", origin: { kind: "derived", derivation: "replay", sourceTraceIds: [TRACE_ID] } });
    expect(recorder.record(textEvent("{}"))).toMatchObject({ status: "recorded" });
    return recorder.close({ terminationReason: "completed", terminationDetail: null }).then((replayed) => {
      expect(isClientGatewayTraceLive(replayed)).toBe(false);
      expect(deriveClientGatewayTraceManifest(replayed, "reingest").origin).toEqual({ kind: "derived", derivation: "reingest", sourceTraceIds: [TRACE_ID] });
    });
  });
});
