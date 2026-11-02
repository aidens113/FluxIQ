import { createExecutionAdmissionAuthority } from "../../../runtime/execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../runtime/execution-admission/tests/scope-owner.ts";
import { AdmissionTestSource } from "../../../runtime/execution-admission/tests/source.ts";
import { captureExecutionCallbackCompletions, type ExecutionCallbackCompletionConfiguration, type ExecutionCallbackRegistrar, type ManagedExecutionCallbackRegistration } from "../../../runtime/execution-observation/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../runtime/automation-host/index.ts";
import { createAutomationExecutionAdmissionSource, bindAutomationExecutionObservation } from "../execution-admission/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";

/** Original host declarations are captured/applied before registration or reserve. */
export async function observedHostFixture(host?: AutomationStudioHostRuntimeBoundary, configuration?: ExecutionCallbackCompletionConfiguration) {
  const policy = configuration ? captureExecutionCallbackCompletions(configuration) : undefined;
  const store = new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const authority = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scope = await authority.openScope(scopes.issue("flow.host-observation", "unverified"));
  const root = new AdmissionTestSource(scope, "fixture.host.root");
  const engine = createAutomationExecutionAdmissionSource(scope);
  const registrar: ExecutionCallbackRegistrar = Object.freeze({
    manage<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void {
      engine.manage(registration);
    }
  });
  policy?.apply(registrar);
  root.delegatesTo.push(engine.owner);
  const rootPorts = authority.registerSource(root);
  engine.connect(authority.registerSource(engine.registration([engine.owner])));
  const abort = new AbortController();
  const origin = root.origin();
  const reserved = await authority.consumer.reserve(scope, rootPorts.issuer.fromOrdinaryAdmission(root.admit(origin)), abort.signal);
  const options: AutomationStudioGraphExecutionOptions = { signal: abort.signal, retryPolicy: { maxAttempts: 1, backoffMs: [] }, ...(host ? { hostRuntime: host } : {}) };
  bindAutomationExecutionObservation(options, engine.forParent({ reservation: reserved.reservation, parent: reserved.root }));
  return { store, authority, scope, engine, root, rootPorts, reserved, options, abort };
}
