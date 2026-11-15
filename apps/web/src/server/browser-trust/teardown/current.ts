import type { CredentialTeardownRuntime } from "./types";

export function assertCredentialTeardownCurrent(runtime: CredentialTeardownRuntime): void {
  if (runtime.current() !== true) throw new Error("Credential teardown runtime is no longer current.");
}
