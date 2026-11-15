import { getBrowserTrustRepository } from "../index";
import { assertCredentialTeardownCurrent } from "./current";
import type { CredentialTeardownRuntime } from "./types";

/** Credential proof can reduce its own ordinary trust, even without an enabled account or live socket. */
export async function forgetHostedCredential(runtime: CredentialTeardownRuntime, token: string): Promise<boolean> {
  assertCredentialTeardownCurrent(runtime);
  const proof = await getBrowserTrustRepository(runtime.primary.paths.fluxiq).lookupCredential(token);
  assertCredentialTeardownCurrent(runtime);
  if (proof.status === "invalid" || (proof.status === "inactive" && proof.reason !== "revoked")) return false;
  const { binding } = proof;
  if (binding.managedHost || binding.workspaceId === runtime.manager.primaryWorkspaceId) return false;
  const { platformReadStoreFor } = await import("../../provisioning-listener");
  assertCredentialTeardownCurrent(runtime);
  const store = await platformReadStoreFor(runtime.primary);
  assertCredentialTeardownCurrent(runtime);
  const lease = await runtime.manager.acquireExisting(binding.workspaceId, {
    current: runtime.current,
    exists: async () => {
      assertCredentialTeardownCurrent(runtime);
      const workspace = await store.getWorkspace(binding.workspaceId);
      assertCredentialTeardownCurrent(runtime);
      return workspace?.workspaceId === binding.workspaceId;
    }
  });
  if (!lease) {
    assertCredentialTeardownCurrent(runtime);
    return false;
  }
  try {
    assertCredentialTeardownCurrent(runtime);
    const result = await lease.fluxiq.programs.clientGateway.revokeTrustedClient(binding.trustedClientId, "The client revoked its own credential.");
    if (typeof result !== "boolean") throw new Error("Credential teardown result is invalid.");
    return result;
  } finally {
    lease.release();
  }
}
