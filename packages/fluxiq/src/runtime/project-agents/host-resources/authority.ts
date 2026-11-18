import type { ClientGatewayHostLeaseTargetSource } from "../../../client-gateway/service/host-lease/index.ts";
import type { AutomationStudioHostLeaseBinding } from "./binding.ts";
import { AutomationStudioHostLeaseScope } from "./lease-scope.ts";

const instances = new WeakMap<object, AutomationStudioHostLeaseAuthority>();

/** Opaque in-process instance capability; neither an instance id nor a lease payload. */
export class AutomationStudioHostLeaseAuthority {
  readonly #domains = new Map<string | null, AutomationStudioHostLeaseBinding>();
  readonly gatewaySource: ClientGatewayHostLeaseTargetSource;

  private constructor() {
    this.gatewaySource = AutomationStudioHostLeaseScope.gatewaySourceFor(this);
    Object.freeze(this);
  }

  static for(instance: object): AutomationStudioHostLeaseAuthority {
    const known = instances.get(instance);
    if (known) return known;
    const authority = new AutomationStudioHostLeaseAuthority();
    instances.set(instance, authority);
    return authority;
  }

  forDomain(domainId: string | null): AutomationStudioHostLeaseBinding {
    if (domainId !== null && (typeof domainId !== "string" || !domainId.trim() || domainId !== domainId.trim())) throw new Error("host_lease.domain_binding_required");
    const known = this.#domains.get(domainId);
    if (known) return known;
    const binding: AutomationStudioHostLeaseBinding = Object.freeze({
      owner: this, domainId,
      current: () => AutomationStudioHostLeaseScope.current(binding),
      isCurrent: (lease) => AutomationStudioHostLeaseScope.isCurrentFor(binding, lease),
      requiresLease: (sessionId) => AutomationStudioHostLeaseScope.requiresLeaseFor(binding, sessionId)
    });
    this.#domains.set(domainId, binding);
    return binding;
  }

  owns(binding: AutomationStudioHostLeaseBinding): boolean {
    return this.#domains.get(binding.domainId) === binding;
  }
}
