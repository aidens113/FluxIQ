import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../../../../framework/automation-service/nodes/index.ts";
import { automationStudioFlowBootstrapRecordOutputIssues, automationStudioFlowBootstrapRecordOutputStaticValue } from "../../../record-output-contract.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../../index.ts";
import { webDomainNodeDefinitionsFixture } from "../../index.ts";

const definitions = webDomainNodeDefinitionsFixture();
const definition = definitions.find((node) => node.id === "web.output.dom-extract_list")!;
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const output: JsonObject = { datasetId: "rows", writeMode: "append", schema: { schemaVersion: "0.1", fields: [{ id: "date", label: "Date", valueType: "string" }] }, process: { where: [{ field: "date", atMost: { $state: { path: "latest", fallback: "2030-01-02" } }, as: "date" }], declaration: { version: 1, source: "a".repeat(64), revision: 1, bindings: { date: "date" } } } };

it("validates a fallback example without filling or changing a persisted processing template", () => {
  const before = structuredClone(output);
  expect(automationStudioFlowBootstrapRecordOutputIssues(definition, output)).toEqual([]);
  expect(automationStudioFlowBootstrapRecordOutputStaticValue(output)).toMatchObject({ process: { where: [{ atMost: "2030-01-02" }] } });
  const registry = new AutomationStudioNodeRegistry(definitions);
  const examples: unknown[] = [];
  registry.bindParameterContract(definition.id, ({ parameterId, value }) => {
    if (parameterId !== "recordOutput") return [];
    examples.push(value);
    return automationStudioFlowBootstrapRecordOutputIssues(definition, value);
  });
  const plan: AutomationStudioFlowBootstrapPlan = { schemaVersion: "0.1", router: { name: "Records", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [{ key: "main", name: "Main", role: "primary", nodes: [{ key: "read", definitionId: definition.id, definitionVersion: definition.version, parameters: { extractList: { item: "li", fields: { date: ".date" } }, recordOutput: output } }], edges: [] }] };
  const checked = validateAutomationStudioFlowBootstrapPlan({ plan, registry, resolution });
  expect(checked.issues.filter((issue) => issue.code.startsWith("record_output.process"))).toEqual([]);
  expect(examples).toEqual([expect.objectContaining({ process: expect.objectContaining({ where: [expect.objectContaining({ atMost: "2030-01-02" })] }) })]);
  expect(output).toEqual(before);
});

it.each(["latest_date", "LatestDate", "constructor", "prototype", "__proto__"])("keeps own static example %s without prototype mutation or changing its saved template", (name) => {
  const value: JsonObject = { ...output, process: { where: [{ field: "date", atMost: { $state: { path: name, fallback: "2030-01-02" } }, as: "date" }], declaration: { version: 1, source: "a".repeat(64), revision: 1, bindings: { date: "date" } } } };
  const before = structuredClone(value);
  expect(automationStudioFlowBootstrapRecordOutputStaticValue(value)).toMatchObject({ process: { where: [{ atMost: "2030-01-02" }] } });
  expect(automationStudioFlowBootstrapRecordOutputIssues(definition, value)).toEqual([]);
  expect(value).toEqual(before);
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
});
