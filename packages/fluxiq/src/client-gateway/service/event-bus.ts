import type { ClientGatewayEvent, ClientGatewayEventHandler } from "@fluxiq/contracts/client-gateway";

/** Fan-out of gateway events to every subscribed handler. */
export class ClientGatewayEventBus {
  private readonly handlers = new Set<ClientGatewayEventHandler>();

  subscribe(handler: ClientGatewayEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async emit(event: ClientGatewayEvent): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(event)));
  }
}
