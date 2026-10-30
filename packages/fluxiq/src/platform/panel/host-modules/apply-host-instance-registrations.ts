import type { FluxIQ } from "../../../framework/index.ts";
import type { HostInstanceRegistration } from "./types.ts";

/** Applies each registration in order, synchronously, threading a replacement instance through. */
export function applyHostInstanceRegistrations(fluxiq: FluxIQ, registrations: readonly HostInstanceRegistration[]): FluxIQ {
  let current = fluxiq;
  for (const register of registrations) {
    const registered = register(current);
    if (registered && typeof (registered as unknown as { then?: unknown }).then === "function") {
      throw new Error("A host module's registerFluxIQHost must be synchronous for the web runtime.");
    }
    current = registered ?? current;
  }
  return current;
}
