import { createHash } from "node:crypto";
import { createSQLiteKeyStore } from "../create-sqlite-key-store.ts";

// Test-only IPC worker: every process owns a separate real SQLite connection.
// Inputs contain only a synthetic database path, enrolled public key id and clock.
process.once("message", async ({ filePath, keyId, nowMs }) => {
  const store = createSQLiteKeyStore({ filePath });
  try {
    const outcome = await store.issue({
      keyId,
      nonceDigest: createHash("sha256").update("same synthetic process-test nonce").digest("hex"),
      nonceExpiresAtMs: nowMs + 600_000,
      session: {
        keyId,
        audience: "https://app.example.com#instance-1",
        tokenDigest: createHash("sha256").update(`synthetic session ${process.pid}`).digest("hex"),
        createdAtMs: nowMs,
        expiresAtMs: nowMs + 3_600_000,
        revokedAtMs: null,
        lastUsedAtMs: null
      }
    });
    await store.close();
    process.send({ outcome }, () => process.disconnect());
  } catch (error) {
    await store.close();
    process.send({ error: typeof error === "object" && error !== null && "code" in error ? error.code : "unexpected" }, () => process.disconnect());
  }
});
process.send({ ready: true });
