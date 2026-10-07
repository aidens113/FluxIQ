import type { AutomationStudioAcceptedProjectSnapshot } from "../index.ts";

/** Complete synthetic data only; never loads real project documents. */
export function snapshot(memberCount = 1): AutomationStudioAcceptedProjectSnapshot {
  const settings = { interventionMode: "manual_approval" as const, interventionModeVersion: 1 as const, executionDefaults: {}, training: {}, adaptation: {}, llm: {}, safety: {}, revision: 1, updatedAt: 1 };
  const flow = (id: string, parent: string | null, subflowId: string | null) => ({
    artifact: { schemaVersion: "0.1" as const, flowId: id, projectId: "project.1", name: id, scope: { kind: "domain" as const, domainId: "domain.test" }, visibility: "private" as const, origin: "manual" as const, source: { mode: "visual" as const }, interface: { inputs: [], outputs: [] }, errors: [], variables: [], nodes: [{ id: `${id}.node`, definitionId: "synthetic.observe", definitionVersion: "1.0.0", parameterValues: { fixture: true } }], edges: [], publication: { status: "draft" as const }, createdAt: 1, updatedAt: 1, metadata: { fixture: true, adaptationModeVersion: 1, adaptationMode: "manual_approval" } },
    resource: { flowId: id, parentFlowId: parent, owningSubflowId: subflowId, name: id, description: "", scopeKind: "domain" as const, scopeId: "domain.test", visibility: "private" as const, origin: "user" as const, sourceMode: "visual" as const, status: "draft" as const, graphRevision: 1, settingsRevision: 1, compiledRevision: null, createdAt: 1, updatedAt: 1, deletedAt: null, settings: structuredClone(settings), inputs: [], outputs: [], variables: [], errors: [] },
    settings: structuredClone(settings)
  });
  const value: AutomationStudioAcceptedProjectSnapshot = {
    schemaVersion: "staged_project_snapshot.v1", storageAuthority: "project_sql",
    project: { projectId: "project.1", domainId: "domain.test", lifecycle: "present", metadata: { fixture: true } },
    capture: { captureId: "capture.1", origin: "synthetic_fixture", compilerVersion: "compiler.v1", normalizerVersion: "normalizer.v1", registryDigest: `sha256:${"a".repeat(64)}` },
    dependencyScope: { publications: "none", global: "none", crossProject: "none" },
    flows: [flow("flow.main", null, null)], routers: [], subflows: [], instructions: [], bindings: [], categories: [], policies: []
  };
  for (let index = 0; index < memberCount; index++) {
    const id = String(index).padStart(3, "0"), subflowId = `subflow.${id}`, graphFlowId = `graph.${id}`, instructionId = `instruction.${id}`;
    value.flows.push(flow(graphFlowId, "flow.main", subflowId));
    value.subflows.push({ artifact: { schemaVersion: "0.1", subflowId, flowId: "flow.main", projectId: "project.1", name: subflowId, role: "utility", status: "active", graphFlowId, inputMapping: [], outputMapping: [], localInstructionIds: [instructionId], createdAt: 1, updatedAt: 1 }, resource: { subflowId, parentFlowId: "flow.main", graphFlowId, parentCategoryId: null, name: subflowId, description: "", role: "utility", status: "active", inputMapping: [], outputMapping: [], approvalOverride: null, revision: 1, createdAt: 1, updatedAt: 1, deletedAt: null } });
    const body = `Instruction ${id}: preserve this complete synthetic body, including Unicode Ω and all source spans.`;
    value.instructions.push({ artifact: { schemaVersion: "0.1", instructionId, title: instructionId, body, scope: { kind: "subflow", projectId: "project.1", flowId: "flow.main", subflowId }, priority: index, status: "active", requirement: "required", tags: ["runtime"], createdAt: 1, updatedAt: 1 }, resource: { instructionId, title: instructionId, bodyObjectId: null, inlineBody: body, requirement: "required", status: "active", priority: index, contentDigest: `fixture.${id}`, revision: 1, createdAt: 1, updatedAt: 1, deletedAt: null, scopes: [{ scopeKind: "subflow", projectId: "project.1", flowId: "flow.main", routerId: null, subflowId, nodeId: null, errorCode: null }], tags: ["runtime"] } });
    value.bindings.push({ bindingId: `binding.${id}`, ownerKind: "subflow", ownerId: subflowId, instructionId, sortKey: id, enabled: true, revision: 1 });
  }
  const rules = value.subflows.map((item, index) => ({ schemaVersion: "0.1" as const, ruleId: `rule.${index}`, routerId: "router.1", name: `Rule ${index}`, target: { kind: "subflow" as const, subflowId: item.artifact.subflowId }, order: index, status: "active" as const, createdAt: 1, updatedAt: 1, metadata: { groupId: "group.1" } }));
  value.routers.push({ artifact: { schemaVersion: "0.1", routerId: "router.1", flowId: "flow.main", projectId: "project.1", name: "Synthetic router", rules, fallback: { kind: "fail", message: "No match" }, status: "active", createdAt: 1, updatedAt: 1 }, resource: { routerId: "router.1", flowId: "flow.main", fallbackKind: "error", fallbackSubflowId: null, revision: 1, createdAt: 1, updatedAt: 1, groups: [{ groupId: "group.1", routerId: "router.1", name: "Fixture group", description: "", order: 0, status: "active", collapsed: false, sortKey: "000", revision: 1, createdAt: 1, updatedAt: 1, metadata: {} }], routes: rules.map(rule => ({ routeId: rule.ruleId, routerId: "router.1", groupId: "group.1", name: rule.name, priority: rule.order, enabled: true, conditionKind: "always", condition: null, targetKind: "subflow", targetSubflowId: rule.target.subflowId, revision: 1, createdAt: 1, updatedAt: 1 })) } });
  value.flows[0]!.artifact.expansion = { routerId: "router.1", subflowIds: value.subflows.map(item => item.artifact.subflowId), instructionIds: value.instructions.map(item => item.artifact.instructionId) };
  return value;
}
