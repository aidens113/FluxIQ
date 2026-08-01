import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientMessage, type ClientGatewayClientType, type ClientGatewayServerMessage } from "../contracts";
import type { ClientGatewayService } from "../service";

export class MockClientGatewayClient {
  readonly sessionId: string;
  readonly clientId: string;

  constructor(private readonly gateway: ClientGatewayService, options: { clientId?: string; clientType?: ClientGatewayClientType; name?: string } = {}) {
    this.clientId = options.clientId ?? `mock.${Math.random().toString(36).slice(2)}`;
    this.sessionId = gateway.connect().sessionId;
    void this.send("client.hello", {
      clientId: this.clientId,
      clientType: options.clientType ?? "custom",
      name: options.name ?? this.clientId
    });
  }

  async pair(pairingCode: string): Promise<void> {
    await this.send("client.pairing_submit", { pairingCode });
  }

  async send<TType extends ClientGatewayClientMessage["type"]>(
    type: TType,
    payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]
  ): Promise<void> {
    await this.gateway.receive(this.sessionId, {
      id: `mock-message.${Math.random().toString(36).slice(2)}`,
      type,
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: Date.now(),
      clientId: this.clientId,
      sessionId: this.sessionId,
      payload
    } as Extract<ClientGatewayClientMessage, { type: TType }>);
  }

  outbound(): ClientGatewayServerMessage[] {
    return this.gateway.outbound(this.sessionId);
  }
}
