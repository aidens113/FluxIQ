import type { ClientGatewayActionResult, ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../client-gateway/index.ts";
import { AutomationStudioHostLeaseScope, type AutomationStudioHostResourceLease, type AutomationStudioHostResourcePort } from "../index.ts";
import { StubHost } from "./stub-host.ts";

/** A client paired on `gateway` that answers every action at once, and the action payloads it was sent. */
export async function connectClient(gateway: ClientGatewayService, clientId: string) {
  const actions: Array<Record<string, unknown>> = [];
  let sessionId = "";
  const session = gateway.connect({
    socket: {
      send: (raw: string) => {
        const message = JSON.parse(raw) as { type: string; payload: Record<string, unknown> };
        if (message.type !== "server.execute_action") return;
        actions.push(message.payload);
        setTimeout(() => void gateway.receive(sessionId, { id: `ack.${actions.length}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: String(message.payload.commandId), status: "succeeded" } }), 0);
      }
    }
  });
  sessionId = session.sessionId;
  await gateway.receive(sessionId, { id: `hello.${clientId}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId, clientType: "extension", capabilities: [] } });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  gateway.clearOutbound(sessionId);
  const act = (actionType = "synthetic.act"): Promise<ClientGatewayActionResult> => gateway.executeAction(sessionId, { actionType }).result;
  return { sessionId, actions, act };
}

export function leasedGateway(): ClientGatewayService {
  return new ClientGatewayService({ commandTimeoutMs: 2_000, hostLease: AutomationStudioHostLeaseScope.gatewaySource });
}

/** One paired client on a gateway wired to the lease scope. */
export async function pairedClient() {
  const gateway = leasedGateway();
  return { gateway, ...(await connectClient(gateway, "client.1")) };
}

/** The stub host, with every grant naming the gateway session its resource lives on. */
export function onSession(host: StubHost, sessionId: string): AutomationStudioHostResourcePort {
  return {
    capacity: host.capacity,
    acquire: async (holder) => {
      const grant = await host.acquire(holder);
      return grant === "at_capacity" ? grant : { ...grant, sessionId };
    },
    release: (lease) => host.release(lease)
  };
}

export function wire(lease: AutomationStudioHostResourceLease): ClientGatewayHostLease {
  return { resourceKey: lease.resourceKey, epoch: lease.epoch, holder: { role: lease.holder.role, briefId: lease.holder.briefId } };
}

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
