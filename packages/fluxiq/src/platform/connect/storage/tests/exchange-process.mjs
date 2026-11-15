import { createConnectService } from "../../runtime/index.ts";
import { createSqliteConnectCodeRepository } from "../index.ts";

// Test-only isolated service. IPC carries synthetic data only; no user store or network is opened.
process.once("message", async ({ filePath, request, approvingSessionDigest, now }) => {
  const repository = createSqliteConnectCodeRepository({ filePath });
  let minted = 0;
  const service = createConnectService({
    repository,
    instanceOrigin: "https://app.example.com",
    gatewayUrl: "wss://app.example.com/gateway",
    now: () => now,
    validateApprovalSession: async (digest) => digest === approvingSessionDigest ? {
      allowed: true,
      user: { userId: "user.synthetic", displayName: "Synthetic User", email: "synthetic@example.com" },
      workspace: { workspaceId: "workspace.synthetic", name: "Synthetic workspace" }
    } : { allowed: false, error: "invalid_grant" },
    issueCredential: async () => {
      minted += 1;
      return { credential: "synthetic-process-issued-credential-0123456789", credentialExpiresAt: now + 60_000, connectedClientId: "browser.process" };
    }
  });
  try {
    const result = await service.exchange(request);
    await repository.close();
    const outcome = result.ok && minted === 1 ? "issued" : !result.ok && result.error.error === "invalid_grant" && minted === 0 ? "replayed" : "unexpected";
    process.send({ outcome }, () => process.disconnect());
  } catch {
    await repository.close();
    process.send({ error: "synthetic-exchange-failed" }, () => process.disconnect());
  }
});
process.send({ ready: true });
