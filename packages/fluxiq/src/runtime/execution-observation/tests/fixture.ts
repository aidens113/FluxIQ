import { createExecutionAdmissionAuthority } from "../../execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../execution-admission/tests/scope-owner.ts";
import { AdmissionTestSource } from "../../execution-admission/tests/source.ts";
import { ExecutionObservationSource } from "../index.ts";

export async function observationFixture() {
  const store = new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const authority = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scope = await authority.openScope(scopes.issue());
  const root = new AdmissionTestSource(scope, "test.root");
  const source = new ExecutionObservationSource(scope, "test.callbacks");
  root.delegatesTo.push(source.owner);
  const rootPorts = authority.registerSource(root);
  source.connect(authority.registerSource(source.registration([source.owner])));
  const origin = root.origin();
  const reserved = await authority.consumer.reserve(scope, rootPorts.issuer.fromOrdinaryAdmission(root.admit(origin)));
  const parent = { reservation: reserved.reservation, parent: reserved.root };
  return { store, scopes, authority, scope, root, rootPorts, source, origin, reserved, parent, observation: source.forParent(parent) };
}
