import { createExecutionAdmissionAuthority } from "../../../execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../execution-admission/tests/scope-owner.ts";
import { AdmissionTestSource } from "../../../execution-admission/tests/source.ts";
import type { AutomationStudioNativeNodeImplementation } from "../../../../components/automation/importer/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest } from "../../../../components/automation/importer/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../native-node-runtime.ts";
import { createNativeExecutionAdmissionSource } from "../index.ts";

export async function nativeObservationFixture(implementation: AutomationStudioNativeNodeImplementation, pure = false) {
  const manifest: AutomationStudioImporterSdkManifest = {
    schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example",
    nodes: [{ schemaVersion: "0.1", id: "example.native", version: "1.0.0", label: "Compute", description: "Test implementation", category: "custom", source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "compute" }, availability: { kind: "domain", domainId: "example" }, capabilities: { executable: true, codeBacked: true }, inputs: [], outputs: [{ id: "value", label: "Value", valueType: "number" }], parameters: [] }]
  };
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: manifest.packageId, packageVersion: manifest.packageVersion, implementations: { compute: implementation } });
  const store = new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const authority = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scope = await authority.openScope(scopes.issue());
  const root = new AdmissionTestSource(scope, "test.root");
  const native = createNativeExecutionAdmissionSource(scope, runtime, pure ? [{ implementation, packageId: manifest.packageId, packageVersion: manifest.packageVersion, definitionId: "example.native", definitionVersion: "1.0.0", contract: "no_direct_effects" }] : []);
  root.delegatesTo.push(native.owner);
  const rootPorts = authority.registerSource(root);
  native.connect(authority.registerSource(native.registration([])));
  const origin = root.origin();
  const reserved = await authority.consumer.reserve(scope, rootPorts.issuer.fromOrdinaryAdmission(root.admit(origin)));
  const parent = { reservation: reserved.reservation, parent: reserved.root };
  return { runtime, native, authority, store, scope, parent, reserved, observation: native.forParent(parent), manifest };
}
