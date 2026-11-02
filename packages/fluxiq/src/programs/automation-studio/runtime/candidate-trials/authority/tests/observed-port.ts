import { createExecutionAdmissionAuthority } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../../../../runtime/execution-admission/tests/scope-owner.ts";
import { ExecutionObservationSource } from "../../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioCandidateTrialModeOwner } from "../../mode/index.ts";
import type { AutomationStudioCandidateTrialPort } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioCandidateTrialSource } from "../../index.ts";

/** Controlled unit callbacks only: the caller owns the original fixed callback, which dispatches no external work. */
export async function observeCandidateTrialFixture(trial: { candidateId: string; port: AutomationStudioCandidateTrialPort }) {
  const store = new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scope = await assembly.openScope(scopes.issue("candidate.controlled.no-dispatch"));
  const callbacks = new ExecutionObservationSource(scope, "candidate.controlled.callbacks");
  callbacks.manage({ receiver: trial, callback: trial.port, contract: "no_direct_effects" });
  const modeOwner = new AutomationStudioCandidateTrialModeOwner({ port: trial.port, candidateId: trial.candidateId, environment: undefined, unjudged: new Map() });
  const configured = new AutomationStudioCandidateTrialSource({ scope, consumer: assembly.consumer, seriesKey: "candidate.controlled.stable", callbacks });
  callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner])));
  configured.connect(assembly.registerSource(configured.registration([callbacks.owner])));
  const source = configured.bind(modeOwner);
  return { store, callbacks, source, configured, assembly, scope };
}
