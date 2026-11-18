import type { ClientGatewaySessionReady } from "@fluxiq/contracts/client-gateway";

export function readyWithMetadata(): ClientGatewaySessionReady {
  return { sessionId: "wire.metadata", token: "synthetic-rotated-credential", projectId: "project.metadata", credentialExpiresAt: 1_900_000_000_000, user: { userId: "user.metadata", displayName: "Test Person", email: "person@example.test" }, workspace: { workspaceId: "workspace.metadata", name: "workspace.metadata" } };
}

export function pendingCommit() {
  let resolve!: () => void;
  const promise = new Promise<void>(finish => { resolve = finish; });
  return { promise, resolve };
}
