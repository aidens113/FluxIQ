import { appManifestDigest, type AppManifestContentV1, type AppManifestV1 } from "@fluxiq/contracts/apps";

export async function appManifestFixture(overrides: Partial<AppManifestContentV1> = {}): Promise<AppManifestV1> {
  const content: AppManifestContentV1 = {
    schemaVersion: 1, publisherId: "publisher.one", appId: "orders", version: "1.0.0", packageDigest: "a".repeat(64),
    frontend: { mode: "production", entryUrl: "https://apps.example.test/orders", allowedOrigins: ["https://apps.example.test"], redirectUris: ["https://apps.example.test/callback"] },
    operations: [{ id: "read-orders", kind: "query", inputs: { type: "object", properties: { limit: { type: "integer", minimum: 1 } }, additionalProperties: false }, result: { type: "array", items: { type: "string" } }, binding: { kind: "dataset-query", id: "query:orders", definitionDigest: "b".repeat(64) }, requestedGrants: [{ capability: "dataset.read", bindingId: "dataset:orders" }] }],
    requestedGrants: [{ capability: "dataset.read", bindingId: "dataset:orders" }],
    requirements: { runtimes: [], environments: ["local", "self-hosted", "cloud"], callbacks: [] },
    compatibility: { appProtocolVersion: 1, minimumCoreVersion: "0.50.0" }, updatePolicy: "consent-required", ...overrides
  };
  return { ...content, manifestDigest: await appManifestDigest(content) };
}
