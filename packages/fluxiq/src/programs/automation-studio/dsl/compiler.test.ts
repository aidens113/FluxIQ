import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, createCallFlowNode } from "../model/index.ts";
import { compileFlowDefinition, compileFlowSource, defineFlow, generateFlowTypeScript, verifyCodeOwnedFlowCompilation } from "./index.ts";
import { AutomationStudioNodeRegistry } from "../nodes/index.ts";

const definition = defineFlow({
  flowId: "flow.dsl", name: "DSL Flow", interface: { inputs: [], outputs: [] },
  nodes: [{ id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "ok" }, position: { x: 10.12345, y: 2 } }], edges: []
});

describe("Automation Studio TypeScript Flow DSL", () => {
  it("compiles deterministically and produces equivalent visual and code-owned IR", () => {
    const visual = compileFlowDefinition(definition, { projectId: "project", now: 1 });
    expect(visual.ok).toBe(true);
    if (!visual.ok) return;
    const source = generateFlowTypeScript(visual.plan.flow);
    const code = compileFlowSource(source, { projectId: "project", moduleId: "flows/dsl.flow.ts", now: 99 });
    expect(code.ok).toBe(true);
    if (!code.ok) return;
    expect(code.plan.flow.nodes).toEqual(visual.plan.flow.nodes);
    expect(code.plan.flow.edges).toEqual(visual.plan.flow.edges);
    expect(generateFlowTypeScript(visual.plan.flow)).toBe(source);
    expect(verifyCodeOwnedFlowCompilation(code.plan.flow)).toBe(true);
    expect(compileFlowSource(source, { projectId: "project", moduleId: "flows/dsl.flow.ts", now: 123 })).toMatchObject({ ok: true, plan: { digest: code.plan.digest } });
  });

  it("returns module locations and never evaluates unsupported TypeScript", () => {
    const source = 'import fs from "node:fs";\nexport default (() => fs.readFileSync("secret"))();';
    const result = compileFlowSource(source, { projectId: "project", moduleId: "flows/unsafe.flow.ts" });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "flow.source_unsupported_module_shape", location: { moduleId: "flows/unsafe.flow.ts", line: 1, column: 1 } }] });
  });

  it("requires pinned Call Flow dependencies and detects compiler-digest tampering", () => {
    const childCall = createCallFlowNode({ id: "child", target: { flowId: "flow.child", version: "1.2.3", scope: { kind: "global" } } });
    const missing = compileFlowDefinition({ flowId: "flow.parent", name: "Parent", nodes: [childCall], edges: [] }, { projectId: "project" });
    expect(missing).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "flow.call_dependency_undeclared" })]) });
    const compiled = compileFlowDefinition({ flowId: "flow.parent", name: "Parent", nodes: [childCall], edges: [], dependencies: [{ id: "flow.child", version: "1.2.3", kind: "flow" }] }, { projectId: "project", moduleId: "flows/parent.flow.ts", sourceDigest: "sha256:source" });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const tampered = structuredClone(compiled.plan.flow); tampered.nodes[0]!.label = "Changed without compilation";
    expect(verifyCodeOwnedFlowCompilation(tampered)).toBe(false);
  });

  it("generates source from an existing visual artifact", () => {
    const blank = createBlankAutomationStudioFlowArtifact({ flowId: "flow.blank", projectId: "project", name: "Blank", now: 1 });
    expect(generateFlowTypeScript(blank)).toContain('export default defineFlow({');
  });

  it("requires exact native-node and named-schema dependency pins", () => {
    const registry = new AutomationStudioNodeRegistry();
    registry.register({ schemaVersion: "0.1", id: "orders.lookup", version: "2.1.0", label: "Lookup", description: "Lookup an order", category: "Orders", source: { kind: "importer", domainId: "orders", packageId: "orders.package", implementationKey: "lookup" }, availability: { kind: "domain", domainId: "orders" }, capabilities: { executable: true }, inputs: [], outputs: [], parameters: [] });
    const nativeDefinition = { flowId: "flow.native", name: "Native", scope: { kind: "domain" as const, domainId: "orders" }, interface: { inputs: [{ id: "order", name: "Order", valueType: { kind: "schema" as const, schemaId: "orders.order", schemaVersion: "3.0.0" } }], outputs: [] }, nodes: [{ id: "lookup", definitionId: "orders.lookup", definitionVersion: "2.1.0" }], edges: [] };
    const missing = compileFlowDefinition(nativeDefinition, { projectId: "project", registry });
    expect(missing).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "flow.node_dependency_undeclared" }), expect.objectContaining({ code: "flow.schema_dependency_undeclared" })]) });
    const pinned = compileFlowDefinition({ ...nativeDefinition, dependencies: [{ kind: "node", id: "orders.lookup", version: "2.1.0" }, { kind: "schema", id: "orders.order", version: "3.0.0" }] }, { projectId: "project", registry });
    expect(pinned.ok).toBe(true);
  });
});
