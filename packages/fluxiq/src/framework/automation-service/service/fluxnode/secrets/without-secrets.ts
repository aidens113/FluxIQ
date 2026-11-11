import type { JsonObject } from "../../../../../core/index.ts";

/** A run's inputs without its secret inputs: what the attempt is given, since the secrets travel beside it (`runtime/run-secrets/`). */
export function fluxNodeInputsWithoutSecrets(inputs: JsonObject, secretNames: readonly string[]): JsonObject {
  if (!secretNames.length) return inputs;
  return Object.fromEntries(Object.entries(inputs).filter(([name]) => !secretNames.includes(name)));
}
