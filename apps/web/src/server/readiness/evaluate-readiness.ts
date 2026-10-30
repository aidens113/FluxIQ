export type ReadinessInput = {
  initialized: boolean;
  draining: boolean;
  gatewayEnabled: boolean;
  gatewayListening: boolean;
};

export type Readiness = { ready: true } | { ready: false; reason: "starting" | "draining" | "gateway_not_listening" };

/** Ready when initialized, not draining, and the gateway is listening if it is enabled. */
export function evaluateReadiness(input: ReadinessInput): Readiness {
  if (input.draining) return { ready: false, reason: "draining" };
  if (!input.initialized) return { ready: false, reason: "starting" };
  if (input.gatewayEnabled && !input.gatewayListening) return { ready: false, reason: "gateway_not_listening" };
  return { ready: true };
}
