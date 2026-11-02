import { createExecutionAdmissionAuthority } from "../../../../runtime/execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../../runtime/execution-admission/tests/scope-owner.ts";
import { AdmissionTestSource } from "../../../../runtime/execution-admission/tests/source.ts";
import { createOutputExecutionAdmissionSource } from "../../../../runtime/output-dispatch/admission/index.ts";
import { createAutomationExecutionAdmissionSource, bindAutomationExecutionObservation } from "../index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";

export async function automationObservationFixture() {
  const store = new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const authority = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scope = await authority.openScope(scopes.issue());
  const root = new AdmissionTestSource(scope, "test.root");
  const output = createOutputExecutionAdmissionSource(scope);
  const engine = createAutomationExecutionAdmissionSource(scope, { output });
  root.delegatesTo.push(engine.owner);
  const rootPorts = authority.registerSource(root);
  output.connect(authority.registerSource(output.registration([output.owner])));
  engine.connect(authority.registerSource(engine.registration([engine.owner, output.owner])));
  const origin = root.origin();
  const reserved = await authority.consumer.reserve(scope, rootPorts.issuer.fromOrdinaryAdmission(root.admit(origin)));
  const parent = { reservation: reserved.reservation, parent: reserved.root };
  const observation = engine.forParent(parent);
  const options: AutomationStudioGraphExecutionOptions = { retryPolicy: { maxAttempts: 4, backoffMs: [] } };
  bindAutomationExecutionObservation(options, observation);
  return { store, authority, scope, root, rootPorts, origin, reserved, parent, observation, options, engine, output };
}
