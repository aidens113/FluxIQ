import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayService } from "../../../client-gateway/index.ts";
import type { AutomationStudioHostResourcePort } from "../../../runtime/automation-host/index.ts";
import { createGlobalProgramRuntime } from "../runtime.ts";

/** Real independent runtime and paired gateway, with no model or persisted user data. */
export async function runtimeHostLeaseFixture(label: string) {
  const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
  const gateway: ClientGatewayService = runtime.clientGateway;
  const actions: Array<Record<string, unknown>> = [];
  let sessionId = "";
  const session = gateway.connect({ socket: { send(raw) {
    const message = JSON.parse(raw) as { id: string; type: string; payload: Record<string, unknown> };
    if (message.type !== "server.execute_action") return;
    actions.push(message.payload);
    queueMicrotask(() => void gateway.receive(sessionId, {
      id: `answer.${label}.${actions.length}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: Date.now(), type: "client.action_result",
      payload: { commandId: String(message.payload.commandId), status: "succeeded" }
    }));
  } } });
  sessionId = session.sessionId;
  await gateway.receive(sessionId, {
    id: `hello.${label}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(),
    type: "client.hello", payload: { clientId: `client.${label}`, clientType: "extension", capabilities: [], metadata: { domainId: "synthetic.same-domain" } }
  });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  gateway.clearOutbound(sessionId);
  let epoch = 0;
  const port: AutomationStudioHostResourcePort = {
    capacity: 1,
    acquire: async () => ({ resourceKey: `resource.${label}`, epoch: ++epoch }),
    release: async () => undefined
  };
  runtime.automationStudio.bindHostRuntime({ capabilities: ["action-dispatch"], hostResources: port });
  return {
    runtime, gateway, sessionId, actions, port,
    act: (actionType: string) => gateway.executeAction(sessionId, { actionType }).result,
    async close() {
      runtime.detach();
      await gateway.close();
      await runtime.automationStudio.close();
      runtime.secretKeys.close();
    }
  };
}
