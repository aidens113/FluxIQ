import { createExecutionAdmissionAuthority, type ExecutionAdmissionPersistence } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../../../../runtime/execution-admission/tests/scope-owner.ts";
import { ExecutionObservationSource } from "../../../../../../runtime/execution-observation/index.ts";
import { createAutomationExecutionAdmissionSource } from "../../../../../../engine/automation/execution-admission/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioSubflowScopedSubmissionController, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowScope, type AutomationStudioSubflowTrialPreparingPort } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioCandidateTrialSource } from "../../index.ts";
import { bindTrialExecutionSource } from "../../observation/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

/** Validated partial proposals and real source registration on one durable Flow continuation. */
export async function partialAdmissionFixture(input: {
  persistence?: ExecutionAdmissionPersistence;
  port: AutomationStudioSubflowTrialPreparingPort;
  reset?: AutomationStudioSiteResetTrialReset;
  noDispatch?: boolean;
  engine?: boolean;
}) {
  const definition: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: "controlled.inspect", version: "1.0.0", label: "Inspect", description: "Inspect an isolated fixture value", category: "action",
    source: { kind: "code", moduleId: "isolated", implementationKey: "controlled.inspect", trust: "trusted-local" }, availability: { kind: "domain", domainId: "controlled" }, capabilities: { executable: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
  };
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, definition]);
  const resolution = { scope: { kind: "domain" as const, domainId: "controlled" }, runtimeCapabilities: [], permissions: [] };
  const scope: AutomationStudioSubflowScope = {
    buildId: "build.isolated", briefId: "brief.inspect", planDigest: "plan.isolated", subflowKey: "inspect", predecessors: [],
    parts: [{ partId: "reading", sourceId: "instruction.isolated", text: "Inspect the isolated fixture reading." }]
  };
  const submission = { projectId: "project.isolated", flowId: "flow.actual", registry, resolution, baseDependencyDigest: "base" };
  const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [], submission });
  const submit = async (name = "initial") => {
    const draft: JsonObject = { summary: "An isolated partial trial", plan: {
      schemaVersion: "0.1", router: { name: "Partial", rules: [], fallback: { kind: "subflow", targetSubflowKey: "inspect" } },
      subflows: [{ key: "inspect", name: "Inspect", role: "primary", nodes: [{ key: "read", definitionId: definition.id, definitionVersion: definition.version, parameters: { text: name } }], edges: [] }]
    } };
    const submitted = await controller.submit(draft);
    if (!submitted.ok) throw new Error("The isolated partial proposal did not validate: " + JSON.stringify(submitted));
    return submitted.proposal;
  };
  const proposal = await submit();
  const persistence = input.persistence ?? new AdmissionTestPersistence();
  const scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence, scopes });
  const executionScope = await assembly.openScope(scopes.issue("flow.actual", "complete"));
  const callbacks = new ExecutionObservationSource(executionScope, "candidate.actual.callbacks");
  const automation = input.engine ? createAutomationExecutionAdmissionSource(executionScope) : undefined;
  if (automation) automation.connect(assembly.registerSource(automation.registration([automation.owner])));
  callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner, ...(automation ? [automation.owner] : [])])));
  const configured = new AutomationStudioCandidateTrialSource({ scope: executionScope, consumer: assembly.consumer, seriesKey: "flow.actual.trials", callbacks, ...(automation ? { automation } : {}) });
  configured.connect(assembly.registerSource(configured.registration([callbacks.owner])));
  bindTrialExecutionSource(input.port, configured);
  if (input.noDispatch) callbacks.manage({ receiver: undefined, callback: input.port, contract: "no_direct_effects" });
  const newGate = (port = input.port) => new AutomationStudioSubflowTrialGate({ scope, latest: () => controller.latest(), port, ...(input.reset ? { reset: input.reset } : {}) });
  const receipt = () => {
    const latest = controller.latest();
    if (!latest) throw new Error("A partial proposal must stand.");
    return { revision: latest.revision, digest: latest.digest };
  };
  return { proposal, submit, scope, submission, controller, registry, resolution, persistence, assembly, executionScope, callbacks, configured, automation, port: input.port, gate: newGate(), newGate, receipt };
}
