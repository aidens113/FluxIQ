import type { FluxIQDeploymentSettings } from "fluxiq/platform/profile";

/** The frame, handshake, rate and pending-pairing limits the transport enforces. */
export type ClientGatewayTransportLimits = FluxIQDeploymentSettings["gateway"]["limits"];

// What a limit the caller leaves out falls back to: Core's `local` profile
// values (`packages/fluxiq/src/platform/profile/resolve/gateway-limits.ts`),
// which keep a loopback install as it always was. A hosted caller passes its
// profile's resolved limits (`resolveFluxIQDeploymentSettings`).
const UNSET_LIMITS: Readonly<ClientGatewayTransportLimits> = Object.freeze({
  maxFrameBytes: 256 * 1024 * 1024,
  helloDeadlineMs: null,
  messagesPerSecond: null,
  messageBurst: null,
  pendingPairingsPerAddress: null,
  pendingPairingsTotal: 1000
});

/** The limits with every omitted one filled in; throws on a value that is not a positive whole number (or null where null turns it off). */
export function resolveClientGatewayTransportLimits(input: Partial<ClientGatewayTransportLimits> | undefined): ClientGatewayTransportLimits {
  const pick = <K extends keyof ClientGatewayTransportLimits>(key: K): ClientGatewayTransportLimits[K] => input?.[key] !== undefined ? input[key] as ClientGatewayTransportLimits[K] : UNSET_LIMITS[key];
  const limits: ClientGatewayTransportLimits = {
    maxFrameBytes: pick("maxFrameBytes"),
    helloDeadlineMs: pick("helloDeadlineMs"),
    messagesPerSecond: pick("messagesPerSecond"),
    messageBurst: pick("messageBurst"),
    pendingPairingsPerAddress: pick("pendingPairingsPerAddress"),
    pendingPairingsTotal: pick("pendingPairingsTotal")
  };
  for (const [key, value] of Object.entries(limits)) {
    const nullable = key !== "maxFrameBytes" && key !== "pendingPairingsTotal";
    if (value === null && nullable) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(`Client gateway limit ${key} must be a positive whole number${nullable ? " or null" : ""}.`);
    }
  }
  return limits;
}
