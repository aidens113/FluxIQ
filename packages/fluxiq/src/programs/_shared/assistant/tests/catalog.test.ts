// The catalog over a real registry: declarations stored and validated, the
// per-actor list filtered by the registry's own decision, search and lookup.
import { describe, expect, it } from "vitest";
import { createFlowInput, listFlowsInput } from "@fluxiq/contracts/program-api-inputs";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiRegistrationParams } from "../../api.ts";
import type { Permission } from "../../../identity-access/index.ts";
import { AssistantToolCatalog, type ProgramEndpointAssistant } from "../index.ts";

const ok = async () => ({ ok: true });

function who(permissions: Permission[]): ProgramApiActor {
  return { sessionId: "session.one", userId: "user.one", roleId: "user", permissions, channel: "panel" };
}

function registryWithTools(): GlobalProgramApiRegistry {
  const registry = new GlobalProgramApiRegistry();
  registry.register({
    programId: "automation-studio", endpoint: "list-flows", permission: "programs.read", classification: "read", handler: ok,
    assistant: { input: listFlowsInput, summary: "Lists the Flows in a project.", phrases: ["show my flows"], contextArgs: { projectId: "projectId" } }
  });
  registry.register({
    programId: "automation-studio", endpoint: "create-flow", permission: "flows.write", classification: "authoring", handler: ok,
    assistant: { input: createFlowInput, summary: "Creates a new, empty Flow in a project.", phrases: ["new flow", "make a flow"], contextArgs: { projectId: "projectId" } }
  });
  registry.register({
    programId: "automation-studio", endpoint: "run-task-again", permission: "runtime.control", classification: "authoring", handler: ok,
    assistant: { input: listFlowsInput, summary: "Runs a task again." }
  });
  registry.register({
    programId: "automation-studio", endpoint: "record-performance", permission: "programs.write", classification: "authoring", handler: ok,
    assistant: { hidden: "Internal measurements, not something a person asks for." }
  });
  registry.register({ programId: "automation-studio", endpoint: "bare-endpoint", permission: "programs.read", classification: "read", handler: ok });
  return registry;
}

describe("assistant declarations on the registry", () => {
  it("lists each registration's declaration from endpoints()", () => {
    const byEndpoint = new Map(registryWithTools().endpoints().map((endpoint) => [endpoint.endpoint, endpoint.assistant]));
    expect(byEndpoint.get("record-performance")).toEqual({ hidden: "Internal measurements, not something a person asks for." });
    expect(byEndpoint.get("list-flows")).toMatchObject({ summary: "Lists the Flows in a project." });
    expect(byEndpoint.get("bare-endpoint")).toBeUndefined();
  });

  it("refuses a malformed declaration at registration", () => {
    const base: Omit<ProgramApiRegistrationParams, "assistant"> = { programId: "automation-studio", endpoint: "list-flows", permission: "programs.read", classification: "read", handler: ok };
    const bad: ProgramEndpointAssistant[] = [
      { hidden: "  " },
      { input: listFlowsInput, summary: "" },
      { input: listFlowsInput, summary: "Lists.", phrases: [""] },
      { input: listFlowsInput, summary: "Lists.", contextArgs: JSON.parse("{\"projectId\":\"selection\"}") as Record<string, "projectId"> },
      { input: listFlowsInput, summary: "Lists.", consequence: JSON.parse("\"write\"") as "read" }
    ];
    for (const assistant of bad) {
      expect(() => new GlobalProgramApiRegistry().register({ ...base, assistant })).toThrow(/assistant entry that is wrong/u);
    }
  });
});

describe("AssistantToolCatalog", () => {
  it("offers only declared tools, by name, with their schema and derived consequence", () => {
    const catalog = new AssistantToolCatalog(registryWithTools());
    expect(catalog.tools().map((tool) => tool.name)).toEqual(["automation-studio__create-flow", "automation-studio__list-flows", "automation-studio__run-task-again"]);
    const create = catalog.describe("automation-studio__create-flow");
    expect(create).toMatchObject({ consequence: "change", action: "studio:CreateFlow", permission: "flows.write", contextArgs: { projectId: "projectId" } });
    expect(create?.inputSchema).toBe(createFlowInput.jsonSchema());
    expect(catalog.describe("automation-studio__list-flows")?.consequence).toBe("read");
    expect(catalog.describe("automation-studio__record-performance")).toBeUndefined();
  });

  it("lists for an actor only the tools the registry allows them", async () => {
    const catalog = new AssistantToolCatalog(registryWithTools());
    expect((await catalog.listFor(who(["programs.read"]))).map((tool) => tool.endpoint)).toEqual(["list-flows"]);
    expect((await catalog.listFor(who(["programs.read", "flows.write", "runtime.control"]))).map((tool) => tool.endpoint)).toEqual(["create-flow", "list-flows", "run-task-again"]);
    expect(await catalog.listFor(who([]))).toEqual([]);
  });

  it("finds tools by words, among a given list when asked", async () => {
    const catalog = new AssistantToolCatalog(registryWithTools());
    expect(catalog.find("make a flow")[0]?.endpoint).toBe("create-flow");
    const readable = await catalog.listFor(who(["programs.read"]));
    expect(catalog.find("make a flow", { among: readable }).map((tool) => tool.endpoint)).toEqual(["list-flows"]);
  });

  it("resolves a per-call run from its Flow, and asks about an unresolved one", () => {
    const catalog = new AssistantToolCatalog(registryWithTools());
    expect(catalog.describe("automation-studio__run-task-again")?.consequence).toBe("per-call");
    expect(catalog.consequencesOf("automation-studio__run-task-again", { lastingClasses: ["send_or_publish"], permittedConsequences: [] })).toEqual(["change", "send"]);
    expect(catalog.consequencesOf("automation-studio__run-task-again")).toEqual(["change", "send", "money", "delete"]);
    expect(catalog.consequencesOf("automation-studio__create-flow")).toEqual(["change"]);
    expect(() => catalog.consequencesOf("automation-studio__nothing")).toThrow(/Unknown assistant tool/u);
  });
});
