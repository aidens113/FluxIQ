import { createHash } from "node:crypto";
import { createSqliteClientTrustRepository } from "../create-sqlite-client-trust-repository.ts";

// Every child holds its own generation-zero snapshot before the common start signal.
const [filePath, workspaceId, label] = process.argv.slice(2);
const repository = createSqliteClientTrustRepository({ filePath, now: () => 1_000_000 });
const store = repository.scopedStore(workspaceId);

try {
  await store.load();
  process.once("message", async () => {
    let outcome = "saved";
    try {
      await store.save([{
        trustedClientId: `synthetic-process-${label}`,
        clientId: "extension.synthetic-process",
        clientType: "extension",
        name: "Synthetic process browser",
        approvedByUserId: "user.synthetic",
        domainId: null,
        tokenHash: createHash("sha256").update(`synthetic-process-token-${label}`).digest("hex"),
        approvedAt: 1_000_000,
        createdAt: 1_000_000,
        updatedAt: 1_000_000,
        lastUsedAt: 1_000_000,
        expiresAt: 2_000_000
      }]);
    } catch (error) {
      outcome = error?.code === "browser_trust.conflict" ? error.reason : "unexpected";
    }
    await repository.close();
    process.send({ outcome }, () => process.disconnect());
  });
  process.send({ ready: true });
} catch (error) {
  await repository.close();
  process.send({ error: error?.code ?? "unexpected initialization failure" }, () => process.disconnect());
}
