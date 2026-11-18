import { appManifestDigest, type AppInstallationV1, type AppManifestContentV1, type AppManifestV1, type AppOperation, type AppOperationResolutionV1 } from "../../apps.ts";

const PACKAGE_DIGEST = "a".repeat(64);
const BINDING_DIGEST = "b".repeat(64);

export function queryOperation(): AppOperation {
  return {
    id: "list-orders", kind: "query", inputs: { type: "null" },
    result: { type: "array", items: { type: "string" } },
    binding: { kind: "dataset-query", id: "orders-query", definitionDigest: BINDING_DIGEST },
    requestedGrants: [{ capability: "dataset.read", bindingId: "orders" }]
  };
}

export function executionOperation(): AppOperation {
  return {
    id: "prepare-order", kind: "execution",
    inputs: { type: "object", properties: { count: { type: "integer", minimum: 1, maximum: 10 } }, required: ["count"], additionalProperties: false },
    result: { type: "string", minLength: 1 },
    binding: { kind: "fluxnode", id: "prepare-order-v1", definitionDigest: BINDING_DIGEST },
    requestedGrants: [{ capability: "automation.execute", bindingId: "prepare-order-v1", acts: ["change", "send"] }]
  };
}

export function manifestContent(): AppManifestContentV1 {
  const operations = [queryOperation(), executionOperation()];
  return {
    schemaVersion: 1, publisherId: "publisher-1", appId: "orders-app", version: "1.2.0", packageDigest: PACKAGE_DIGEST,
    frontend: { mode: "production", entryUrl: "https://app.example/", allowedOrigins: ["https://app.example"], redirectUris: ["https://app.example/callback"] },
    operations, requestedGrants: operations.flatMap(operation => operation.requestedGrants),
    requirements: { runtimes: ["fluxnode"], environments: ["local", "self-hosted", "cloud"], callbacks: [{ id: "fulfillment", kind: "server" }] },
    compatibility: { appProtocolVersion: 1, minimumCoreVersion: "0.51.0" }, updatePolicy: "consent-required"
  };
}

export function manifestFixture(): AppManifestV1 {
  return { ...manifestContent(), manifestDigest: "c".repeat(64) };
}

export async function verifiedManifest(): Promise<AppManifestV1> {
  const content = manifestContent();
  return { ...content, manifestDigest: await appManifestDigest(content) };
}

export function installationFixture(manifest = manifestFixture()): AppInstallationV1 {
  const { publisherId, appId, version, packageDigest, manifestDigest } = manifest;
  return {
    schemaVersion: 1, installationId: "installation-1", workspaceId: "workspace-1",
    app: { publisherId, appId, version, packageDigest, manifestDigest }, approvedGrants: manifest.requestedGrants,
    target: { kind: "customer-owned", environment: "local", targetId: "gateway-1" }, payer: { kind: "no-managed-compute-charge" },
    installedByUserId: "user-1", installedAtMs: 1000, updatedAtMs: 1000, generation: 1, revision: 1, status: "active"
  };
}

export function resolutionFixture(): AppOperationResolutionV1 {
  const operation = executionOperation();
  const installation = installationFixture();
  return {
    schemaVersion: 1, kind: "operation-resolution", installationId: installation.installationId,
    operationId: operation.id, operationKind: operation.kind, manifestDigest: installation.app.manifestDigest,
    generation: 1, revision: 1, binding: operation.binding, target: installation.target, payer: installation.payer, requiredGrants: operation.requestedGrants
  };
}
