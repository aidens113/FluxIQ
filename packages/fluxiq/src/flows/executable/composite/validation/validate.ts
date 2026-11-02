import type { ExecutableGraph } from "../../graph/index.ts";
import type { AutomationStudioFlowScope } from "../../scope.ts";
import type { AutomationStudioValidationIssue, AutomationStudioValidationResult } from "../../validation/index.ts";
import type { ExecutableFlowSnapshot } from "../snapshot/index.ts";
import { getCallFlowConfiguration } from "../configuration.ts";
import { findCompositeCycle } from "./cycle.ts";
import { validateBindings } from "./bindings.ts";
import { sameScope, compositionScopeAllows } from "./scope.ts";

export function validateFlowComposition(input: { flow: Pick<ExecutableGraph, "flowId" | "nodes"> & { scope: AutomationStudioFlowScope }; publishedSnapshots: ExecutableFlowSnapshot[]; deprecatedPublicationIds?: Iterable<string>; authorizedDomainIds?: Iterable<string>; runtimeCapabilities?: Iterable<string> }): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const snapshots = new Map(input.publishedSnapshots.map((snapshot) => [`${snapshot.flowId}@${snapshot.version}`, snapshot]));
  for (const [index, node] of input.flow.nodes.entries()) {
    const call = getCallFlowConfiguration(node);
    if (!call) continue;
    const path = `nodes.${index}`;
    const target = snapshots.get(`${call.target.flowId}@${call.target.version}`);
    if (!target) {
      issues.push({ severity: "error", code: "flow.call_target_missing", message: `Published Flow ${call.target.flowId}@${call.target.version} is unavailable.`, path });
      continue;
    }
    if (new Set(input.deprecatedPublicationIds ?? []).has(`${call.target.flowId}@${call.target.version}`)) issues.push({ severity: "error", code: "flow.call_target_deprecated", message: `Published Flow ${call.target.flowId}@${call.target.version} is deprecated and requires a reviewed upgrade.`, path });
    if (!sameScope(target.scope, call.target.scope)) issues.push({ severity: "error", code: "flow.call_target_scope_mismatch", message: "Call Flow target scope does not match its published snapshot.", path });
    if (!compositionScopeAllows(input.flow.scope, target.scope, input.authorizedDomainIds)) issues.push({ severity: "error", code: "flow.cross_scope_call_not_authorized", message: "Call Flow scope is not authorized by the caller's explicit domain grants.", path });
    validateBindings(call.inputBindings, target.interface.inputs.map((port) => port.id), issues, `${path}.inputBindings`);
    validateBindings(call.outputBindings, target.interface.outputs.map((port) => port.id), issues, `${path}.outputBindings`);
    validateBindings(call.errorBindings, target.errors.map((error) => error.id), issues, `${path}.errorBindings`);
    const boundInputs = new Set((call.inputBindings ?? []).map((binding) => binding.targetPortId));
    for (const port of target.interface.inputs) if (port.required && port.defaultValue === undefined && !boundInputs.has(port.id)) issues.push({ severity: "error", code: "flow.call_required_input_unbound", message: `Required Call Flow input ${port.id} has no binding or default.`, path: `${path}.inputBindings` });
    if (input.runtimeCapabilities !== undefined) {
      const runtimeCapabilities = new Set(input.runtimeCapabilities);
      for (const capability of target.requiredRuntimeCapabilities ?? []) if (!runtimeCapabilities.has(capability)) issues.push({ severity: "error", code: "flow.call_runtime_capability_unavailable", message: `Published Flow ${call.target.flowId}@${call.target.version} requires unavailable runtime capability ${capability}.`, path });
    }
  }
  const cycle = findCompositeCycle(input.flow, snapshots);
  if (cycle) issues.push({ severity: "error", code: "flow.composite_cycle", message: `Composite Flow dependency cycle: ${cycle.join(" -> ")}.`, path: "nodes" });
  return { ok: issues.length === 0, issues };
}
