import type { NativeManagedCompletionRegistration } from "./registration.ts";

/** Pins trusted executable declarations before a scope can bind its runtime. */
export function pinNativeExecutionCompletions(registrations: readonly NativeManagedCompletionRegistration[]): readonly NativeManagedCompletionRegistration[] {
  return Object.freeze(registrations.map(registration => {
    const identity = { implementation: registration.implementation, packageId: registration.packageId, packageVersion: registration.packageVersion, definitionId: registration.definitionId, definitionVersion: registration.definitionVersion };
    return registration.contract === "no_direct_effects"
      ? Object.freeze({ ...identity, contract: "no_direct_effects" as const })
      : Object.freeze({ ...identity, contract: "managed_direct_effects" as const, consumeCompletion: registration.consumeCompletion.bind(registration) });
  }));
}
