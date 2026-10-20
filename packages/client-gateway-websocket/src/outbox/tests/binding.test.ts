import { describe, expect, it } from "vitest";
import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import { clientGatewayOutboxBinding } from "../index.ts";
import { recordingEvent, stateUpdate, stopRecording } from "./messages.ts";

describe("clientGatewayOutboxBinding", () => {
  it("binds to the recording the payload names, over the recording in progress", () => {
    expect(clientGatewayOutboxBinding(stopRecording("rec.payload"), "lineage.1", { projectId: "project.1", recordingId: "rec.current" }))
      .toEqual({ session: "lineage.1", projectId: "project.1", recordingId: "rec.payload" });
  });

  it("falls back to the recording in progress when the payload names none", () => {
    expect(clientGatewayOutboxBinding(recordingEvent(undefined), "lineage.1", { projectId: "project.1", recordingId: "rec.current" }))
      .toEqual({ session: "lineage.1", projectId: "project.1", recordingId: "rec.current" });
  });

  it("binds to no recording when neither the payload nor the context names one", () => {
    expect(clientGatewayOutboxBinding(stateUpdate(), "lineage.2", { projectId: null, recordingId: null }))
      .toEqual({ session: "lineage.2", projectId: null, recordingId: null });
  });

  it("ignores a payload recordingId that is not a string", () => {
    const message = { ...stateUpdate(), payload: { recordingId: 42 } } as unknown as ClientGatewayClientMessage;
    expect(clientGatewayOutboxBinding(message, "lineage.1", { projectId: "project.1", recordingId: null }).recordingId).toBeNull();
  });
});
