import { expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService } from "../../../../client-gateway/index.ts";
import { AutomationStudioService } from "../../runtime/service.ts";
import { AutomationStudioClientGatewayBridge } from "../bridge.ts";

it("server-start refuses a missing description before browser start or durable creation", async () => {
  const gateway = new ClientGatewayService();
  const service = new AutomationStudioService({ seedFixture: false });
  const create = vi.spyOn(service, "createRecording");
  const send = vi.spyOn(gateway, "startRecording");
  const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio: service });
  try {
    await expect(bridge.startRecording({ sessionId: "unused", recordingId: "missing-description" })).rejects.toMatchObject({ code: "recording.description_required" });
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  } finally { await service.close(); }
});

it("client-start returns description refusal before owner lookup and start acknowledgement", async () => {
  const gateway = new ClientGatewayService();
  const service = new AutomationStudioService({ seedFixture: false });
  const lookup = vi.fn().mockResolvedValue({ ok: true, projectId: "unused" });
  const create = vi.spyOn(service, "createRecording");
  const start = vi.spyOn(gateway, "startRecording");
  const error = vi.spyOn(gateway, "sendError");
  new AutomationStudioClientGatewayBridge({ gateway, automationStudio: service, clientRecordingContextProvider: lookup });
  try {
    const session = gateway.connect();
    await gateway.receive(session.sessionId, { id: "hello", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1, payload: { clientId: "description-test", clientType: "custom", name: "Recorder" } });
    await gateway.approvePairing(gateway.snapshot().pairings[0]!.pairingCode, { approvedByUserId: "operator" });
    await gateway.receive(session.sessionId, { id: "start", type: "client.start_recording", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 2, payload: { recordingId: "missing-description" } });
    expect(error).toHaveBeenCalledWith(session.sessionId, { code: "recording.description_required", message: "Describe what this recording demonstrates before starting it." });
    expect(lookup).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  } finally { await service.close(); }
});
