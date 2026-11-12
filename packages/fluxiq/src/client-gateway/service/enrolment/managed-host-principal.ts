/**
 * Who a managed host's trust acts for. No person approves a host the engine
 * launched itself, so its trust is approved by the principal open-mode FluxNode
 * runs act as, and its program calls are judged as that principal's.
 */
export const FLUXIQ_MANAGED_HOST_PRINCIPAL = "fluxnode.owner";
