import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../../framework/automation-service/nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";

const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const output: JsonObject = { datasetId: "records", writeMode: "append", schema: { schemaVersion: "0.1", fields: [{ id: "date", label: "Date", valueType: "string" }] } };
const accept = (result: JsonObject) => acceptAutomationStudioFlowBootstrapResult({ result, registry, resolution });

describe("untrusted whole Flow processing metadata", () => {
  it.each([null, { version: 1, source: "a".repeat(64), revision: 1, bindings: {} }])("refuses stamps in nested JSON plans and handler script blocks", (declaration) => {
    const recordOutput = { ...output, process: { declaration } };
    const json = accept({ plan: { subflows: { main: { nodes: [{ definitionId: "web.output.dom-extract_list", parameters: { extractList: { item: "li" }, recordOutput } }] } } } });
    expect(json.ok).toBe(false);
    expect(json.issues.map((issue) => issue.code)).toContain("record_output.process_declaration_framework_owned");
    const script = accept({ flow: ["flow: List records", "step main: Read", "node: web.output.dom-extract_list", "extractList: {\"item\":\"li\"}", "on retry: recover", "step handler: Read again", "node: web.output.dom-extract_list", `recordOutput: ${JSON.stringify(recordOutput)}`, "end"].join("\n") });
    expect(script.ok).toBe(false);
    expect(script.issues.map((issue) => issue.code)).toContain("record_output.process_declaration_framework_owned");
  });

  it("refuses raw state only inside authored processing, with the same repairable code", () => {
    const recordOutput = { ...output, process: { where: [{ field: "date", atMost: { $state: { path: "latest", fallback: "2030-01-02" } }, as: "date" }] } };
    const json = accept({ nodes: [{ definitionId: "web.output.dom-extract_list", parameters: { extractList: { item: "li" }, recordOutput } }] });
    expect(json.ok).toBe(false);
    expect(json.issues.map((issue) => issue.code)).toContain("record_output.process_input_binding_required");
    const script = accept({ flow: ["step: Read", "node: web.output.dom-extract_list", `recordOutput: ${JSON.stringify(recordOutput)}`].join("\n") });
    expect(script.ok).toBe(false);
    expect(script.issues.map((issue) => issue.code)).toContain("record_output.process_input_binding_required");
  });

  it("does not treat a captured row's declaration field as framework authority", () => {
    const accepted = accept({ nodes: [{ definitionId: "builtin.data.write-records", parameters: { records: [{ declaration: "ordinary data", recordOutput: { process: { declaration: "also row data" } } }], recordOutput: { ...output, schema: { schemaVersion: "0.1", fields: [{ id: "declaration", label: "Declaration", valueType: "string" }] } } } }] });
    expect(accepted.issues.map((issue) => issue.code)).not.toContain("record_output.process_declaration_framework_owned");
  });
});
