/**
 * Stripe metadata keys this server reads. `account` names the paying FluxIQ
 * account on a subscription (set by this server at checkout); `resources`
 * names a dedicated grant's exact resources on a subscription item, comma
 * separated (set by the operator after provisioning).
 */
export const STRIPE_METADATA = Object.freeze({ account: "fluxiq_account_id", resources: "fluxiq_resource_ids" });
