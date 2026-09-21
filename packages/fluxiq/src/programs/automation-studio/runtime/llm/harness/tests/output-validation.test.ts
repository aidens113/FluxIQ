import { describe, expect, it } from "vitest";
import {
  AutomationStudioNodeRegistry,
  canonicalBuiltinAutomationNodeDefinitions,
  type AutomationStudioNodeDefinition
} from "../../../../nodes/index.ts";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmStructuredResponse } from "../structured-response.ts";
import { validateAutomationStudioLlmOutput } from "../output-validation.ts";

const DEFINITION_ID = "web.output.dom-run_javascript";
const SOURCE = "return { marker: inputs.marker };";

function javascriptDefinition(): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: DEFINITION_ID,
    version: "1.0.0",
    label: "Run JavaScript",
    description: "Run reviewed browser JavaScript.",
    category: "web",
    source: { kind: "importer", domainId: "web-automation", implementationKey: "web.dom.run_javascript" },
    availability: { kind: "domain", domainId: "web-automation" },
    capabilities: { executable: true },
    requiredRuntimeCapabilities: ["web.actions"],
    safety: { privileged: true, requiresOperatorApproval: true, requiredPermissions: ["web-automation.action"] },
    outputAction: { fixedOutputId: "web.dom.run_javascript" },
    inputs: [{ id: "in", label: "In", valueType: "signal", role: "control" }],
    outputs: [
      { id: "success", label: "Success", valueType: "any", role: "success" },
      { id: "failed", label: "Failed", valueType: "any", role: "failure" }
    ],
    parameters: [
      { id: "source", label: "Source", valueType: "string", allowStateBinding: false, executableSource: { language: "javascript" } },
      { id: "inputs", label: "Inputs", valueType: "object" }
    ]
  };
}

const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, javascriptDefinition()]);
const flowBootstrap = {
  registry,
  resolution: {
    scope: { kind: "domain" as const, domainId: "web-automation" },
    runtimeCapabilities: ["web.actions"],
    permissions: ["web-automation.action"]
  },
  maxInputTokens: 8_000
};

function response(inputs: JsonValue = { marker: "reviewed" }, extra: Record<string, JsonValue> = {}): AutomationStudioLlmStructuredResponse {
  return {
    kind: "flow_bootstrap" as const,
    summary: "Run reviewed JavaScript.",
    plan: {
      schemaVersion: "0.1" as const,
      router: { name: "Router", rules: [], fallback: { kind: "subflow" as const, targetSubflowKey: "primary" } },
      subflows: [{
        key: "primary",
        name: "Primary",
        role: "primary" as const,
        nodes: [
          { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
          { key: "javascript", definitionId: DEFINITION_ID, definitionVersion: "1.0.0", parameters: { source: SOURCE, inputs, ...extra } },
          { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
        ],
        edges: [
          { key: "start_js", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "javascript", portId: "in" } },
          { key: "js_end", source: { nodeKey: "javascript", portId: "success" }, target: { nodeKey: "end", portId: "in" } }
        ]
      }]
    }
  };
}

function executableCodes(value: AutomationStudioLlmStructuredResponse): string[] {
  return validateAutomationStudioLlmOutput(value, "flow_bootstrap", flowBootstrap)
    .filter((diagnostic) => diagnostic.code === "llm_output.executable_code")
    .map((diagnostic) => diagnostic.code);
}

describe("registered executable-source output", () => {
  it("allows only the exact registered literal parameter", () => {
    expect(executableCodes(response())).toEqual([]);
  });

  it("still refuses copied identical source under an unrelated code key", () => {
    expect(executableCodes(response({ marker: "reviewed" }, { code: SOURCE }))).toEqual(["llm_output.executable_code"]);
  });

  it("preserves ordinary source-labelled data nested inside a structured parameter", () => {
    expect(executableCodes(response({ metadata: { source: "catalog" } }))).toEqual([]);
  });
});
