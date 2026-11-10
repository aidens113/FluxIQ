// Assistant parity over the live registry: every endpoint either declares how
// the panel assistant may call it or says why it stays hidden, and every
// declaration is one a model can use. The rule is enforced here, not by review.
import { describe, expect, it } from "vitest";
import { listFlowsInput } from "@fluxiq/contracts/program-api-inputs";
import { createGlobalProgramRuntime } from "../../runtime.ts";
import { ASSISTANT_CONSEQUENCE_OVERRIDES, ASSISTANT_TOOL_NAME_LIMIT, assistantToolName, assistantToolOf, undeclaredAssistantEndpoints, type AssistantEndpointSummary } from "../index.ts";

const TOOL_NAME = /^[a-z0-9_-]+$/u;

function byProgram(names: readonly string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const name of names) {
    const [programId = "", endpoint = ""] = name.split("__", 2);
    (grouped[programId] ??= []).push(endpoint);
  }
  return grouped;
}

describe("undeclaredAssistantEndpoints", () => {
  it("names a bare endpoint and passes a declared or hidden one", () => {
    const endpoints: AssistantEndpointSummary[] = [
      { programId: "automation-studio", endpoint: "list-flows", permission: "programs.read", classification: "read", assistant: { input: listFlowsInput, summary: "Lists the Flows in a project." } },
      { programId: "automation-studio", endpoint: "record-performance", permission: "programs.write", classification: "authoring", assistant: { hidden: "Internal measurements." } },
      { programId: "automation-studio", endpoint: "bare-endpoint", permission: "programs.read", classification: "read" }
    ];
    expect(undeclaredAssistantEndpoints(endpoints)).toEqual(["automation-studio__bare-endpoint"]);
  });
});

describe("assistant parity of the live program registry", () => {
  const endpoints = createGlobalProgramRuntime().api.endpoints();

  it("gives every endpoint a unique tool name a provider accepts", () => {
    const names = endpoints.map((endpoint) => assistantToolName(endpoint.programId, endpoint.endpoint));
    expect(new Set(names).size).toBe(names.length);
    const bad = names.filter((name) => name.length > ASSISTANT_TOOL_NAME_LIMIT || !TOOL_NAME.test(name));
    expect(bad, "tool names too long or with characters a provider refuses").toEqual([]);
  });

  it("keeps the overrides table to endpoints that exist", () => {
    const registered = new Set(endpoints.map((endpoint) => `${endpoint.programId}/${endpoint.endpoint}`));
    expect(Object.keys(ASSISTANT_CONSEQUENCE_OVERRIDES).filter((key) => !registered.has(key))).toEqual([]);
  });

  it("builds every declared tool: an object schema, a derivable consequence, and context arguments that name its fields", () => {
    const problems: string[] = [];
    for (const endpoint of endpoints) {
      const name = assistantToolName(endpoint.programId, endpoint.endpoint);
      try {
        const tool = assistantToolOf(endpoint);
        if (tool === undefined) continue;
        if (tool.inputSchema.type !== "object") problems.push(`${name}: its input is not a JSON object`);
        const fields = Object.keys((tool.inputSchema.properties ?? {}) as object);
        for (const field of Object.keys(tool.contextArgs)) {
          if (!fields.includes(field)) problems.push(`${name}: contextArgs.${field} is not an input field`);
        }
      } catch (error) {
        problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("has an assistant declaration or a hidden reason on every endpoint", () => {
    const undeclared = undeclaredAssistantEndpoints(endpoints);
    console.info(JSON.stringify({ registrations: endpoints.length, undeclared: undeclared.length, byProgram: Object.fromEntries(Object.entries(byProgram(undeclared)).map(([programId, names]) => [programId, names.length])) }));
    expect(undeclared, `${undeclared.length} of ${endpoints.length} endpoints have neither \`assistant\` nor \`assistant: { hidden }\`:\n${JSON.stringify(byProgram(undeclared), null, 2)}`).toEqual([]);
  });
});
