import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../components/automation/index.ts";
import { compileFlowDefinition, compileFlowSource, defineFlow, generateFlowTypeScript, parseConstrainedFlowModule } from "../index.ts";

const definition = defineFlow({ flowId: "flow.neutral", name: "Neutral", nodes: [{ id: "z", definitionId: "builtin.data.constant", parameterValues: { value: "ok" }, position: { x: 10.12345, y: 2 } }, { id: "a", definitionId: "builtin.control.start" }], edges: [{ id: "a.z", sourceNodeId: "a", targetNodeId: "z" }] });

describe("framework declarative Flow compiler", () => {
  it("compiles and normalizes without authoring or persistence state", () => {
    const compiled = compileFlowDefinition(definition);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.plan.flow.nodes.map(node => node.id)).toEqual(["a", "z"]);
    expect(compiled.plan.flow.nodes[1]?.position).toEqual({ x: 10.123, y: 2 });
    for (const field of ["projectId", "source", "publication", "createdAt", "updatedAt", "visibility", "origin"]) expect(compiled.plan.flow).not.toHaveProperty(field);
    expect(compileFlowDefinition(definition)).toEqual(compiled);
    expect(definition.nodes[0]?.position?.x).toBe(10.12345);
  });
  it("round-trips new canonical source and reads legacy generated module prefixes", () => {
    const compiled = compileFlowDefinition(definition);
    if (!compiled.ok) throw new Error("Expected compilation");
    const source = generateFlowTypeScript(compiled.plan.flow);
    expect(source).toContain('from "fluxiq/flows/executable/dsl"');
    const rebuilt = compileFlowSource(source, { moduleId: "flows/neutral.flow.ts" });
    expect(rebuilt).toEqual(compiled);
    expect(parseConstrainedFlowModule(source.replace("fluxiq/flows/executable/dsl", "fluxiq/automation-studio/dsl"), "legacy.ts").ok).toBe(true);
  });
  it("never evaluates expressions or arbitrary import modules", () => {
    expect(compileFlowSource('import fs from "node:fs";\nexport default (() => fs.readFileSync("secret"))();', { moduleId: "unsafe.ts" })).toMatchObject({ ok: false, diagnostics: [{ code: "flow.source_unsupported_module_shape" }] });
    expect(parseConstrainedFlowModule('import { defineFlow } from "fluxiq/flows/executable/dsl";\n\nexport default defineFlow({"flowId": process.exit(1)});', "expression.ts")).toMatchObject({ ok: false, diagnostics: [{ code: "flow.source_invalid_json" }] });
  });
  it("performs local graph and type validation with one authority", () => {
    const compiled = compileFlowDefinition({ flowId: "flow.invalid", name: "Invalid", interface: { inputs: [{ id: "count", name: "Count", valueType: { kind: "number" }, defaultValue: "wrong" }], outputs: [] }, nodes: [{ id: "duplicate", definitionId: "builtin.control.start" }, { id: "duplicate", definitionId: "builtin.control.start" }], edges: [{ id: "missing", sourceNodeId: "duplicate", targetNodeId: "absent" }] });
    expect(compiled).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "flow.port_default_type_mismatch" }), expect.objectContaining({ code: "flow.duplicate_node_id" }), expect.objectContaining({ code: "flow.edge_missing_target_node" })]) });
  });
  it("requires exact registered node and schema dependencies", () => {
    const registry = new AutomationStudioNodeRegistry();
    registry.register({ schemaVersion: "0.1", id: "ledger.lookup", version: "2.1.0", label: "Lookup", description: "Lookup a record", category: "Ledger", source: { kind: "importer", domainId: "ledger", packageId: "ledger.package", implementationKey: "lookup" }, availability: { kind: "domain", domainId: "ledger" }, capabilities: { executable: true }, inputs: [], outputs: [], parameters: [] });
    const declared = { flowId: "flow.native", name: "Native", scope: { kind: "domain" as const, domainId: "ledger" }, interface: { inputs: [{ id: "record", name: "Record", valueType: { kind: "schema" as const, schemaId: "ledger.record", schemaVersion: "3.0.0" } }], outputs: [] }, nodes: [{ id: "lookup", definitionId: "ledger.lookup", definitionVersion: "2.1.0" }], edges: [] };
    expect(compileFlowDefinition(declared, { registry })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "flow.node_dependency_undeclared" }), expect.objectContaining({ code: "flow.schema_dependency_undeclared" })]) });
    expect(compileFlowDefinition({ ...declared, dependencies: [{ kind: "node", id: "ledger.lookup", version: "2.1.0" }, { kind: "schema", id: "ledger.record", version: "3.0.0" }] }, { registry }).ok).toBe(true);
  });
  it("requires declared pinned composite dependencies", () => {
    const call = { id: "child", definitionId: "flow.child", definitionVersion: "1.2.3", metadata: { "fluxiq.callFlow": { target: { flowId: "flow.child", version: "1.2.3", scope: { kind: "global" } } } } };
    expect(compileFlowDefinition({ flowId: "flow.parent", name: "Parent", nodes: [call] })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "flow.call_dependency_undeclared" })]) });
    expect(compileFlowDefinition({ flowId: "flow.parent", name: "Parent", nodes: [call], dependencies: [{ kind: "flow", id: "flow.child", version: "1.2.3" }] }).ok).toBe(true);
  });
});
