import { automationStudioInterventionMode, validateAutomationStudioFlow, validateAutomationStudioFlowInstruction, validateAutomationStudioFlowRouter, validateAutomationStudioFlowSubflow } from "../../../model/index.ts";
import type { AutomationStudioAcceptedProjectSnapshot, AutomationStudioAcceptedStateBinding, AutomationStudioAcceptedStateVectorEntry } from "./contracts.ts";
import { automationStudioAcceptedStateDigest } from "./digest.ts";

/** Structural storage checks only. Native dependency interpretation and capture completeness are not certified. */
export class AutomationStudioAcceptedStateValidation {
  static id(value: unknown): asserts value is string {
    if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) fail("id_invalid");
  }
  static binding(value: AutomationStudioAcceptedStateBinding, projectId: string): void {
    if (!value || Object.keys(value).length !== 5 || Object.keys(value).some(key => !["projectId", "epoch", "generation", "digest", "state"].includes(key))) fail("binding_invalid");
    this.id(value.projectId); this.id(value.epoch); positive(value.generation);
    if (value.projectId !== projectId || !/^sha256:[a-f0-9]{64}$/.test(value.digest) || !["staged", "tombstoned"].includes(value.state)) fail("binding_invalid");
  }
  static snapshot(input: AutomationStudioAcceptedProjectSnapshot, projectId: string): AutomationStudioAcceptedProjectSnapshot {
    // Clone through strict canonical JSON before inspecting, so caller mutations cannot change a queued write.
    const value = JSON.parse(automationStudioAcceptedStateDigest(input).json) as AutomationStudioAcceptedProjectSnapshot;
    if (value.schemaVersion !== "staged_project_snapshot.v1" || value.storageAuthority !== "project_sql") fail("unsupported_storage_authority");
    this.id(projectId); this.id(value.project.projectId); this.id(value.project.domainId);
    if (value.project.projectId !== projectId || value.project.lifecycle !== "present") fail("project_invalid");
    object(value.project.metadata);
    this.id(value.capture.captureId); this.id(value.capture.compilerVersion); this.id(value.capture.normalizerVersion);
    if (!["synthetic_fixture", "explicit_snapshot"].includes(value.capture.origin) || !/^sha256:[a-f0-9]{64}$/.test(value.capture.registryDigest)) fail("capture_invalid");
    if (value.dependencyScope.publications !== "none" || value.dependencyScope.global !== "none" || value.dependencyScope.crossProject !== "none") fail("unsupported_dependency_scope");
    for (const key of ["flows", "routers", "subflows", "instructions", "bindings", "categories", "policies"] as const) if (!Array.isArray(value[key])) fail("membership_missing");
    const flows = unique(value.flows, entry => entry.artifact.flowId);
    const routers = unique(value.routers, entry => entry.artifact.routerId);
    const subflows = unique(value.subflows, entry => entry.artifact.subflowId);
    const instructions = unique(value.instructions, entry => entry.artifact.instructionId);
    unique(value.bindings, entry => entry.bindingId); const categories = unique(value.categories, entry => entry.categoryId); const policies = unique(value.policies, entry => entry.policyId);
    for (const entry of value.flows) {
      const { artifact: flow, resource, settings } = entry;
      if (flow.schemaVersion !== "0.1" || flow.projectId !== projectId || flow.scope.kind !== "domain" || flow.scope.domainId !== value.project.domainId || flow.source.mode !== "visual") fail("unsupported_flow_scope_or_source");
      if (!["draft", "publishable"].includes(flow.publication.status) || (flow.publicationHistory?.length ?? 0) > 0) fail("unsupported_publication");
      if (flow.nodes.some(node => node.definitionId.startsWith("composite.flow.") || Object.hasOwn(node.metadata ?? {}, "fluxiq.callFlow"))) fail("unsupported_publication");
      if (!validateAutomationStudioFlow(flow).ok) fail("graph_invalid");
      for (const node of flow.nodes) { this.id(node.id); this.id(node.definitionId); }
      for (const edge of flow.edges) { this.id(edge.id); this.id(edge.sourceNodeId); this.id(edge.targetNodeId); }
      for (const region of flow.regions ?? []) this.id(region.id);
      for (const handoff of flow.regionHandoffs ?? []) this.id(handoff.id);
      for (const item of [...flow.interface.inputs, ...flow.interface.outputs, ...flow.errors, ...flow.variables]) this.id(item.id);
      required(resource, ["flowId", "parentFlowId", "owningSubflowId", "name", "description", "scopeKind", "scopeId", "visibility", "origin", "sourceMode", "status", "graphRevision", "settingsRevision", "compiledRevision", "createdAt", "updatedAt", "deletedAt", "settings", "inputs", "outputs", "variables", "errors"]);
      if (resource.flowId !== flow.flowId || resource.scopeKind !== "domain" || resource.scopeId !== value.project.domainId || resource.sourceMode !== "visual") fail("flow_resource_mismatch");
      if (resource.name !== flow.name || resource.description !== (flow.description ?? "") || resource.createdAt !== flow.createdAt || resource.updatedAt !== flow.updatedAt) fail("flow_resource_mismatch");
      if (resource.parentFlowId !== null && !flows.has(resource.parentFlowId) || resource.owningSubflowId !== null && !subflows.has(resource.owningSubflowId)) fail("owner_missing");
      if ((resource.parentFlowId === null) !== (resource.owningSubflowId === null) || resource.owningSubflowId !== null && subflows.get(resource.owningSubflowId)?.artifact.graphFlowId !== flow.flowId) fail("graph_owner_mismatch");
      if (!["draft", "active", "archived", "deleted"].includes(resource.status) || !["private", "project", "domain", "global"].includes(resource.visibility) || !["user", "recording", "adaptation", "import", "system"].includes(resource.origin)) fail("flow_resource_invalid");
      if (resource.visibility !== (flow.visibility === "public" ? "domain" : "private") || resource.origin !== (flow.origin === "recorded" ? "recording" : flow.origin === "imported" || flow.origin === "migrated" ? "import" : "user")) fail("flow_resource_disagreement");
      positive(resource.graphRevision); positive(resource.settingsRevision);
      required(settings, ["interventionMode", "interventionModeVersion", "executionDefaults", "training", "adaptation", "llm", "safety", "revision", "updatedAt"]);
      if (!["fully_adaptive", "manual_approval", "no_llm_intervention"].includes(settings.interventionMode) || settings.interventionModeVersion !== 1 || resource.settingsRevision !== settings.revision || automationStudioAcceptedStateDigest(resource.settings).digest !== automationStudioAcceptedStateDigest(settings).digest) fail("settings_invalid");
      positive(settings.revision); for (const key of ["executionDefaults", "training", "adaptation", "llm", "safety"] as const) object(settings[key]);
      same(flow.executionDefaults ?? {}, settings.executionDefaults, "execution_defaults_disagreement");
      if (automationStudioInterventionMode(flow.metadata) !== settings.interventionMode) fail("settings_disagreement");
      if (flow.metadata?.adaptationMode !== undefined && flow.metadata.adaptationMode !== settings.interventionMode) fail("settings_disagreement");
      for (const [metadataKey, settingsKey] of [["trainingModeSettings", "training"], ["adaptationPolicySettings", "adaptation"], ["llmSettings", "llm"], ["safetySettings", "safety"]] as const) if (flow.metadata?.[metadataKey] !== undefined) same(flow.metadata[metadataKey], settings[settingsKey], "settings_disagreement");
      for (const key of ["inputs", "outputs", "variables", "errors"] as const) if (!Array.isArray(resource[key])) fail("flow_resource_missing");
      for (const [key, direction] of [["inputs", "input"], ["outputs", "output"]] as const) {
        const ports = unique(resource[key], port => port.portId);
        if (ports.size !== flow.interface[key].length) fail("interface_disagreement");
        for (const port of flow.interface[key]) {
          const sqlPort = ports.get(port.id);
          if (!sqlPort || sqlPort.direction !== direction || sqlPort.name !== port.name || sqlPort.required !== (port.required ?? false)) fail("interface_disagreement");
          same(sqlPort.valueType, port.valueType, "interface_disagreement"); same(sqlPort.defaultValue, port.defaultValue ?? null, "interface_disagreement"); positive(sqlPort.revision);
        }
      }
      const variables = unique(resource.variables, item => item.variableId), errors = unique(resource.errors, item => item.errorId);
      if (variables.size !== flow.variables.length || errors.size !== flow.errors.length) fail("flow_resource_disagreement");
      for (const variable of flow.variables) { const sqlVariable = variables.get(variable.id); if (!sqlVariable || sqlVariable.name !== variable.name) fail("flow_resource_disagreement"); same(sqlVariable.valueType, variable.valueType, "flow_resource_disagreement"); same(sqlVariable.initialValue, variable.initialValue ?? null, "flow_resource_disagreement"); positive(sqlVariable.revision); }
      for (const error of flow.errors) { const sqlError = errors.get(error.id); if (!sqlError || sqlError.code !== error.id) fail("flow_resource_disagreement"); positive(sqlError.revision); }
      if (flow.expansion?.routerId && routers.get(flow.expansion.routerId)?.artifact.flowId !== flow.flowId) fail("router_missing");
      for (const id of flow.expansion?.subflowIds ?? []) if (subflows.get(id)?.artifact.flowId !== flow.flowId) fail("subflow_missing");
      for (const id of flow.expansion?.instructionIds ?? []) if (!instructions.has(id)) fail("instruction_missing");
      if (flow.expansion?.adaptationPolicyId && policies.get(flow.expansion.adaptationPolicyId)?.flowId !== flow.flowId) fail("policy_missing");
    }
    for (const entry of value.subflows) {
      const { artifact, resource } = entry;
      required(resource, ["subflowId", "parentFlowId", "graphFlowId", "parentCategoryId", "name", "description", "role", "status", "inputMapping", "outputMapping", "approvalOverride", "revision", "createdAt", "updatedAt", "deletedAt"]);
      if (artifact.schemaVersion !== "0.1" || artifact.projectId !== projectId || !flows.has(artifact.flowId) || !artifact.graphFlowId || !flows.has(artifact.graphFlowId) || !validateAutomationStudioFlowSubflow(artifact).ok) fail("subflow_invalid");
      if (artifact.subflowId !== resource.subflowId || artifact.flowId !== resource.parentFlowId || artifact.graphFlowId !== resource.graphFlowId) fail("subflow_resource_mismatch");
      if (artifact.name !== resource.name || (artifact.description ?? "") !== resource.description || artifact.role !== resource.role || artifact.createdAt !== resource.createdAt || artifact.updatedAt !== resource.updatedAt || (artifact.status === "disabled" ? "draft" : artifact.status) !== resource.status) fail("subflow_resource_mismatch");
      if (!["active", "disabled", "archived"].includes(artifact.status)) fail("subflow_invalid");
      same(artifact.inputMapping ?? [], resource.inputMapping, "subflow_mapping_disagreement"); same(artifact.outputMapping ?? [], resource.outputMapping, "subflow_mapping_disagreement");
      const approval = artifact.interventionModeOverride === "no_llm_intervention" ? "disabled" : artifact.interventionModeOverride === "manual_approval" ? "manual_approval" : artifact.interventionModeOverride === "fully_adaptive" ? "adaptive" : artifact.proposalModeOverride === "manual" ? "manual_approval" : artifact.proposalModeOverride === "auto" || artifact.proposalModeOverride === "mixed" ? "adaptive" : null;
      if (approval !== resource.approvalOverride) fail("subflow_approval_disagreement");
      const graph = flows.get(artifact.graphFlowId)!;
      if (graph.resource.parentFlowId !== artifact.flowId || graph.resource.owningSubflowId !== artifact.subflowId) fail("graph_owner_mismatch");
      positive(resource.revision);
      if (resource.parentCategoryId !== null && categories.get(resource.parentCategoryId)?.flowId !== artifact.flowId) fail("category_missing");
      for (const id of artifact.localInstructionIds ?? []) if (!instructions.has(id)) fail("instruction_missing");
      const parent = flows.get(artifact.flowId)!.artifact;
      for (const mapping of artifact.inputMapping ?? []) if (!parent.interface.inputs.some(port => port.id === mapping.flowInputId) || !graph.artifact.interface.inputs.some(port => port.id === mapping.subflowInputId)) fail("mapping_missing");
      for (const mapping of artifact.outputMapping ?? []) if (!parent.interface.outputs.some(port => port.id === mapping.flowOutputId) || !graph.artifact.interface.outputs.some(port => port.id === mapping.subflowOutputId)) fail("mapping_missing");
    }
    for (const entry of value.routers) {
      const { artifact, resource } = entry;
      required(resource, ["routerId", "flowId", "fallbackKind", "fallbackSubflowId", "revision", "createdAt", "updatedAt", "groups", "routes"]);
      if (artifact.schemaVersion !== "0.1" || artifact.projectId !== projectId || artifact.routerId !== resource.routerId || artifact.flowId !== resource.flowId || !flows.has(artifact.flowId) || !validateAutomationStudioFlowRouter(artifact, value.subflows.filter(item => item.artifact.flowId === artifact.flowId).map(item => item.artifact)).ok) fail("router_invalid");
      positive(resource.revision); const groups = unique(resource.groups, item => item.groupId); unique(resource.routes, item => item.routeId);
      if (!["active", "disabled", "archived"].includes(artifact.status)) fail("router_invalid");
      for (const group of resource.groups) { required(group, ["groupId", "routerId", "name", "description", "order", "status", "collapsed", "sortKey", "revision", "createdAt", "updatedAt", "metadata"]); if (group.routerId !== artifact.routerId || !["active", "disabled", "archived"].includes(group.status) || typeof group.collapsed !== "boolean") fail("router_group_mismatch"); positive(group.revision); }
      for (const route of resource.routes) {
        required(route, ["routeId", "routerId", "groupId", "name", "priority", "enabled", "conditionKind", "condition", "targetKind", "targetSubflowId", "revision", "createdAt", "updatedAt"]);
        if (route.routerId !== artifact.routerId || route.groupId !== null && !groups.has(route.groupId)) fail("router_route_mismatch");
        if (route.targetKind === "flow") fail("unsupported_route_target");
        if (route.targetKind === "subflow" && subflows.get(route.targetSubflowId ?? "")?.artifact.flowId !== artifact.flowId) fail("router_target_missing");
        positive(route.revision);
      }
      if (resource.fallbackKind === "subflow" && subflows.get(resource.fallbackSubflowId ?? "")?.artifact.flowId !== artifact.flowId) fail("router_target_missing");
      const ruleIds = new Set(artifact.rules.map(rule => rule.ruleId));
      if (ruleIds.size !== resource.routes.length || resource.routes.some(route => !ruleIds.has(route.routeId))) fail("router_projection_membership_mismatch");
      for (const rule of artifact.rules) {
        this.id(rule.ruleId); const route = resource.routes.find(item => item.routeId === rule.ruleId)!;
        if (route.targetKind !== "subflow" || route.targetSubflowId !== rule.target.subflowId || route.priority !== rule.order || route.enabled !== (rule.status === "active") || route.name !== rule.name || route.groupId !== (typeof rule.metadata?.groupId === "string" ? rule.metadata.groupId : null)) fail("router_projection_disagreement");
        same(route.condition, rule.condition ?? null, "router_projection_disagreement");
      }
      if (resource.fallbackSubflowId !== (artifact.fallback?.kind === "subflow" ? artifact.fallback.subflowId : null) || resource.fallbackKind !== (artifact.fallback?.kind === "subflow" ? "subflow" : "error")) fail("router_fallback_disagreement");
    }
    for (const entry of value.instructions) {
      const { artifact, resource } = entry;
      required(resource, ["instructionId", "title", "bodyObjectId", "inlineBody", "requirement", "status", "priority", "contentDigest", "revision", "createdAt", "updatedAt", "deletedAt", "scopes", "tags"]);
      if (artifact.schemaVersion !== "0.1" || artifact.instructionId !== resource.instructionId || typeof artifact.body !== "string" || !validateAutomationStudioFlowInstruction(artifact).ok) fail("instruction_invalid");
      if (artifact.scope.kind === "global") fail("unsupported_instruction_scope");
      if (artifact.scope.projectId !== projectId) fail("cross_project_instruction");
      if (resource.inlineBody !== null && resource.inlineBody !== artifact.body) fail("instruction_body_mismatch");
      if (artifact.title !== resource.title || artifact.priority !== resource.priority || (artifact.requirement === "advisory" ? "guidance" : "required") !== resource.requirement || (artifact.status === "disabled" ? "draft" : artifact.status) !== resource.status || artifact.createdAt !== resource.createdAt || artifact.updatedAt !== resource.updatedAt) fail("instruction_resource_mismatch");
      if (!["advisory", "required"].includes(artifact.requirement) || !["active", "disabled", "archived"].includes(artifact.status)) fail("instruction_invalid");
      same(artifact.tags ?? [], resource.tags, "instruction_tags_disagreement");
      if (resource.inlineBody === null && resource.bodyObjectId === null) fail("instruction_source_missing");
      if (resource.bodyObjectId !== null) this.id(resource.bodyObjectId);
      positive(resource.revision);
      if (!Array.isArray(resource.scopes) || !resource.scopes.length) fail("instruction_scope_missing");
      for (const scope of resource.scopes) {
        required(scope, ["scopeKind", "projectId", "flowId", "routerId", "subflowId", "nodeId", "errorCode"]);
        if (scope.scopeKind === "global" || scope.projectId !== projectId) fail("unsupported_instruction_scope");
        if (!["project", "flow", "router", "subflow", "node", "error"].includes(scope.scopeKind) || scope.scopeKind !== "project" && scope.flowId === null || scope.scopeKind === "router" && scope.routerId === null || scope.scopeKind === "subflow" && scope.subflowId === null || scope.scopeKind === "node" && scope.nodeId === null) fail("instruction_scope_missing");
        if (scope.flowId !== null && !flows.has(scope.flowId) || scope.routerId !== null && routers.get(scope.routerId)?.artifact.flowId !== scope.flowId || scope.subflowId !== null && subflows.get(scope.subflowId)?.artifact.flowId !== scope.flowId) fail("instruction_owner_missing");
        if (scope.nodeId !== null && !flows.get(scope.flowId ?? "")?.artifact.nodes.some(node => node.id === scope.nodeId)) fail("instruction_node_missing");
        if (scope.errorCode !== null && !flows.get(scope.flowId ?? "")?.artifact.errors.some(error => error.id === scope.errorCode)) fail("instruction_error_missing");
      }
      const scope = artifact.scope;
      const projectedKind = scope.kind === "on_error" ? "error" : scope.kind === "adaptation_review" ? "flow" : scope.kind;
      if (!resource.scopes.some(item => item.scopeKind === projectedKind && item.flowId === ("flowId" in scope ? scope.flowId : null) && item.routerId === ("routerId" in scope ? scope.routerId : null) && item.subflowId === ("subflowId" in scope ? scope.subflowId ?? null : null) && item.nodeId === ("nodeId" in scope ? scope.nodeId ?? null : null))) fail("instruction_scope_disagreement");
      if ("flowId" in scope && !flows.has(scope.flowId) || "routerId" in scope && routers.get(scope.routerId)?.artifact.flowId !== scope.flowId || "subflowId" in scope && scope.subflowId && subflows.get(scope.subflowId)?.artifact.flowId !== scope.flowId) fail("instruction_owner_missing");
      if ("nodeId" in scope && scope.nodeId && !flows.get(scope.flowId)?.artifact.nodes.some(node => node.id === scope.nodeId)) fail("instruction_node_missing");
    }
    for (const binding of value.bindings) {
      required(binding, ["bindingId", "ownerKind", "ownerId", "instructionId", "sortKey", "enabled", "revision"]);
      if (!instructions.has(binding.instructionId)) fail("binding_instruction_missing");
      const ownerExists = binding.ownerKind === "project" ? binding.ownerId === projectId : binding.ownerKind === "flow" ? flows.has(binding.ownerId) : binding.ownerKind === "router" ? routers.has(binding.ownerId) : binding.ownerKind === "subflow" ? subflows.has(binding.ownerId) : false;
      if (!ownerExists) fail("binding_owner_missing"); positive(binding.revision);
      if (typeof binding.enabled !== "boolean" || typeof binding.sortKey !== "string") fail("binding_invalid");
    }
    for (const category of value.categories) {
      required(category, ["categoryId", "flowId", "parentCategoryId", "name", "sortKey", "revision", "createdAt", "updatedAt"]);
      if (!flows.has(category.flowId) || category.parentCategoryId !== null && categories.get(category.parentCategoryId)?.flowId !== category.flowId) fail("category_owner_missing"); positive(category.revision);
    }
    for (const policy of value.policies) {
      required(policy, ["policyId", "projectId", "flowId", "subflowId", "preset", "proposalMode", "settings", "revision", "createdAt", "updatedAt", "deletedAt"]);
      if (policy.projectId !== projectId || !flows.has(policy.flowId) || policy.subflowId !== null && subflows.get(policy.subflowId)?.artifact.flowId !== policy.flowId) fail("policy_owner_missing"); positive(policy.revision); object(policy.settings);
    }
    return value;
  }
  static vector(snapshot: AutomationStudioAcceptedProjectSnapshot, epoch: string, generation: number): AutomationStudioAcceptedStateVectorEntry[] {
    this.id(epoch); positive(generation);
    const entries: Array<{ kind: string; id: string; value: unknown }> = [{ kind: "project", id: snapshot.project.projectId, value: { project: snapshot.project, capture: snapshot.capture, dependencyScope: snapshot.dependencyScope } }];
    for (const item of snapshot.flows) { entries.push({ kind: "flow", id: item.artifact.flowId, value: item }); entries.push({ kind: "settings", id: item.artifact.flowId, value: item.settings }); }
    for (const item of snapshot.routers) entries.push({ kind: "router", id: item.artifact.routerId, value: item });
    for (const item of snapshot.subflows) entries.push({ kind: "subflow", id: item.artifact.subflowId, value: item });
    for (const item of snapshot.instructions) entries.push({ kind: "instruction", id: item.artifact.instructionId, value: item });
    for (const item of snapshot.bindings) entries.push({ kind: "binding", id: item.bindingId, value: item });
    for (const item of snapshot.categories) entries.push({ kind: "category", id: item.categoryId, value: item });
    for (const item of snapshot.policies) entries.push({ kind: "policy", id: item.policyId, value: item });
    return entries.map(item => ({ kind: item.kind, id: item.id, epoch, generation, digest: automationStudioAcceptedStateDigest(item.value).digest })).sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  }
}
function fail(code: string): never { throw new Error(`staged_authority.${code}`); }
function positive(value: number): void { if (!Number.isSafeInteger(value) || value < 1) fail("revision_invalid"); }
function object(value: unknown): void { if (!value || typeof value !== "object" || Array.isArray(value)) fail("object_missing"); }
function required(value: unknown, keys: string[]): void { object(value); for (const key of keys) if (!Object.hasOwn(value!, key)) fail("required_field_missing"); }
function unique<T>(entries: T[], getId: (entry: T) => string): Map<string, T> { const map = new Map<string, T>(); for (const entry of entries) { const id = getId(entry); AutomationStudioAcceptedStateValidation.id(id); if (map.has(id)) fail("duplicate_member"); map.set(id, entry); } return map; }
function same(left: unknown, right: unknown, code: string): void { if (automationStudioAcceptedStateDigest(left).digest !== automationStudioAcceptedStateDigest(right).digest) fail(code); }
