import { createExecutionAdmissionAuthority } from "../../../../../runtime/execution-admission/index.ts";
import type { AdmissionTestPersistence } from "../../../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../../../runtime/execution-admission/tests/scope-owner.ts";
import { AdmissionTestSource } from "../../../../../runtime/execution-admission/tests/source.ts";

export async function reserveReopenedSecretScope(history: AdmissionTestPersistence) {
  const scopes = new AdmissionTestScopeOwner();
  const authority = createExecutionAdmissionAuthority({ persistence: history, scopes });
  const scope = await authority.openScope(scopes.issue());
  const root = new AdmissionTestSource(scope, "test.root");
  const ports = authority.registerSource(root);
  return await authority.consumer.reserve(scope, ports.issuer.fromOrdinaryAdmission(root.admit(root.origin())));
}
