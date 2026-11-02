import { createExecutionAdmissionAuthority, type ExecutionAdmissionPersistence } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../../../../runtime/execution-admission/tests/scope-owner.ts";
import { ExecutionCallbackRootSource, ExecutionObservationSource } from "../../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioCandidateTrialModeOwner } from "../../mode/index.ts";
import { AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioCandidateTrialSource, candidateTrialModeOwner } from "../../index.ts";
import type { AutomationStudioCandidateTrialPort } from "../../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../../flow-bootstrap/site-reset/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

/** Actual validated/submitted candidates and original callbacks; no synthesized Flow or receipt casts. */
export async function candidateAdmissionFixture(input: {
  persistence?: ExecutionAdmissionPersistence;
  baseline?: "complete" | "unverified";
  candidateId?: string;
  port: AutomationStudioCandidateTrialPort;
  noDispatch?: boolean;
  reset?: AutomationStudioSiteResetTrialReset;
}) {
  const definition: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: "controlled.inspect", version: "1.0.0", label: "Inspect", description: "Inspect a fixture value", category: "action",
    source: { kind: "importer", domainId: "controlled", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "controlled" }, capabilities: { executable: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
  };
  const registry = new AutomationStudioNodeRegistry([definition]);
  const resolution = { scope: { kind: "domain" as const, domainId: "controlled" }, runtimeCapabilities: [], permissions: [] };
  const submission = { projectId: "project.isolated", flowId: "flow.actual", registry, resolution, baseDependencyDigest: "base" };
  const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
  const draft = (name = "initial"): JsonObject => {
    const plan = { schemaVersion: "0.1", router: { name, rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [
      { key: "primary", name: "Primary", role: "primary", nodes: [{ key: "inspect", definitionId: definition.id, definitionVersion: definition.version, parameters: { text: name } }], edges: [] }
    ] };
    return { summary: "An isolated controlled trial", plan };
  };
  const submit = async (name = "initial") => {
    const submitted = await controller.submit(draft(name));
    if (!submitted.ok) throw new Error("The isolated candidate did not validate.");
    return submitted.candidate;
  };
  const candidate = await submit();
  const persistence = input.persistence ?? new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence, scopes });
  const scope = await assembly.openScope(scopes.issue("flow.actual", input.baseline));
  const callbacks = new ExecutionObservationSource(scope, "candidate.actual.callbacks");
  const trial = { candidateId: input.candidateId ?? "candidate.actual", port: input.port };
  if (input.noDispatch) callbacks.manage({ receiver: trial, callback: trial.port, contract: "no_direct_effects" });
  const modeOwner = candidateTrialModeOwner(trial.port) ?? new AutomationStudioCandidateTrialModeOwner({ port: trial.port, candidateId: trial.candidateId, environment: undefined, unjudged: new Map() });
  const configured = new AutomationStudioCandidateTrialSource({ scope, consumer: assembly.consumer, seriesKey: "flow.actual.trials", callbacks });
  callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner])));
  configured.connect(assembly.registerSource(configured.registration([callbacks.owner])));
  const ordinary = new ExecutionCallbackRootSource(scope, assembly.consumer, callbacks, "candidate.actual.ordinary");
  ordinary.connect(assembly.registerSource(ordinary.registration([callbacks.owner])));
  const source = configured.bind(modeOwner);
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => controller.latest(), trial, ...(input.reset ? { reset: input.reset } : {}) });
  return { candidate, controller, submit, draft, submission, persistence, assembly, scope, callbacks, source, configured, ordinary, trial, gate };
}
