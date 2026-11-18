import type { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { TrustedModuleBuildIdentity } from "../../../runtime/build-identity/modules/index.ts";
import type { ClientGatewayTransportLimits } from "../transport-limits.ts";

type SharedBinding = {
  owners: number;
  signature: string;
  lease: ReturnType<ClientGatewayService["bindTransportBuildIdentity"]>;
};
type Binding = { references: number; shared: SharedBinding };
const SHARED_BINDINGS = new WeakMap<ClientGatewayService, SharedBinding>();

/** One build binding per gateway, shared across listener owners and their sockets. */
export class ClientGatewayTransportIdentityLeases {
  private readonly bindings = new Map<ClientGatewayService, Binding>();
  private listening = false;
  private ended = false;

  constructor(private readonly identity: TrustedModuleBuildIdentity | null | undefined, private readonly limits?: ClientGatewayTransportLimits) {}

  acquire(gateway: ClientGatewayService): { release(): void } {
    if (this.ended) throw new Error("Client gateway listener is closed.");
    let binding = this.bindings.get(gateway);
    if (!binding) {
      const signature = identitySignature(this.identity);
      let shared = SHARED_BINDINGS.get(gateway);
      if (shared && shared.signature !== signature) throw new Error("Conflicting client gateway transport build identities.");
      if (this.limits) gateway.setPairingLimits({ perAddress: this.limits.pendingPairingsPerAddress, total: this.limits.pendingPairingsTotal });
      if (!shared) {
        shared = { owners: 0, signature, lease: gateway.bindTransportBuildIdentity(this.identity) };
        SHARED_BINDINGS.set(gateway, shared);
      }
      shared.owners += 1;
      binding = { references: 0, shared };
      this.bindings.set(gateway, binding);
      if (this.listening) binding.shared.lease.activate();
    }
    binding.references += 1;
    const owned = binding;
    let released = false;
    return { release: () => {
      if (released) return;
      released = true;
      if (this.bindings.get(gateway) !== owned) return;
      owned.references -= 1;
      if (owned.references === 0) {
        this.bindings.delete(gateway);
        releaseShared(gateway, owned.shared);
      }
    } };
  }

  activate(): void {
    this.listening = true;
    for (const binding of this.bindings.values()) binding.shared.lease.activate();
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    for (const [gateway, binding] of this.bindings) releaseShared(gateway, binding.shared);
    this.bindings.clear();
  }
}

function releaseShared(gateway: ClientGatewayService, binding: SharedBinding): void {
  binding.owners -= 1;
  if (binding.owners !== 0) return;
  SHARED_BINDINGS.delete(gateway);
  binding.lease.release();
}

function identitySignature(identity: TrustedModuleBuildIdentity | null | undefined): string {
  return JSON.stringify(identity ? [identity.schema, identity.protocol, identity.moduleId, identity.version, identity.normalization, identity.artifactDigest, identity.sourceInputsDigest] : null);
}
