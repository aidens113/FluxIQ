import { createExecutionAdmissionAuthority } from "../index.ts";
import { AdmissionTestPersistence } from "./persistence.ts";
import { AdmissionTestScopeOwner } from "./scope-owner.ts";
import { AdmissionTestSource } from "./source.ts";

export async function admissionFixture(input: { store?: AdmissionTestPersistence; baseline?: "complete" | "unverified"; continuation?: string; sourceKey?: string; series?: boolean; runId?: string } = {}) {
  const store = input.store ?? new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scope = await assembly.openScope(scopes.issue(input.continuation, input.baseline));
  const source = new AdmissionTestSource(scope, input.sourceKey ?? "test.source", input.series ? { kind: "trial_series", seriesKey: "stable.trial.series" } : { kind: "ordinary" });
  source.delegatesTo.push(source.owner);
  const ports = assembly.registerSource(source);
  const origin = source.origin(undefined, input.runId);
  const proof = source.admit(origin);
  const grant = ports.issuer.fromOrdinaryAdmission(proof);
  return { assembly, scope, scopes, store, source, ports, origin, proof, grant };
}
