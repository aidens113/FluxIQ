import { bindTrustedModuleIdentity, readTrustedModuleIdentities, type TrustedModuleBuildIdentity } from "../../../runtime/build-identity/modules/index.ts";
import type { TrustedTransportBuildLease } from "./lease.ts";
/** A gateway-owned capture survives route reload and never shares the native runtime slot. */
export class ClientGatewayTransportBuildIdentity {
  private readonly anchorOwner = {};
  private current: { identity: TrustedModuleBuildIdentity | null; listening: boolean } | undefined;
  bind(identity?: TrustedModuleBuildIdentity | null): TrustedTransportBuildLease {
    bindTrustedModuleIdentity(this.anchorOwner, identity);
    const lease = { identity: readTrustedModuleIdentities(this.anchorOwner)[0] ?? null, listening: false };
    this.current = lease;
    return Object.freeze({
      activate: () => { if (this.current === lease) lease.listening = true; },
      release: () => { if (this.current === lease) { this.current = undefined; bindTrustedModuleIdentity(this.anchorOwner); } }
    });
  }
  read(): TrustedModuleBuildIdentity | null { return this.current?.listening ? this.current.identity : null; }
}
