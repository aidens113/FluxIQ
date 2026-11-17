import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayTrustedClientStore } from "../../types.ts";

/** A copied durable snapshot with explicit save barriers; every credential is synthetic. */
export class RevocationStore implements ClientGatewayTrustedClientStore {
  clients: ClientGatewayTrustedClient[] = [];
  saves = 0;
  failNext = false;
  private pending?: { entered(): void; result: Promise<void> };

  async load(): Promise<ClientGatewayTrustedClient[]> {
    return structuredClone(this.clients);
  }

  async save(clients: ClientGatewayTrustedClient[]): Promise<void> {
    this.saves += 1;
    const pending = this.pending;
    delete this.pending;
    if (pending) {
      pending.entered();
      await pending.result;
    }
    if (this.failNext) {
      this.failNext = false;
      throw new Error("synthetic save rejected");
    }
    this.clients = structuredClone(clients);
  }

  blockNextSave(): { entered: Promise<void>; succeed(): void; fail(): void } {
    let entered!: () => void;
    let succeed!: () => void;
    let reject!: (error: Error) => void;
    const observed = new Promise<void>((resolve) => { entered = resolve; });
    const result = new Promise<void>((resolve, fail) => {
      succeed = resolve;
      reject = fail;
    });
    this.pending = { entered, result };
    return { entered: observed, succeed, fail: () => reject(new Error("synthetic save rejected")) };
  }
}
