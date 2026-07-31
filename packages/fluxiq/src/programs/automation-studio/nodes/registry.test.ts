import { describe, expect, it } from "vitest";
import { automationNodeClassGroups, automationNodeClasses, builtinAutomationNodeDefinitions, getAutomationNodeDefinition, getAutomationNodeDefinitions } from "./registry";

describe("automation node registry", () => {
  it("groups built-in node definitions by stable domain-neutral classes", () => {
    expect(automationNodeClasses).toContain("control-flow");
    expect(automationNodeClasses).toContain("math");
    expect(automationNodeClasses).toContain("random");
    expect(automationNodeClasses).toContain("database");
    expect(automationNodeClasses).toContain("custom");
    expect(automationNodeClassGroups.every((group) => group.label.length > 0)).toBe(true);
  });

  it("exposes policy and routine scoped palettes from the same registry", () => {
    const policyNodes = getAutomationNodeDefinitions("policy");
    const routineNodes = getAutomationNodeDefinitions("routine");

    expect(policyNodes.some((node) => node.id === "builtin.policy.action")).toBe(true);
    expect(policyNodes.some((node) => node.id === "builtin.routine.task-policy")).toBe(false);
    expect(routineNodes.some((node) => node.id === "builtin.routine.task-policy")).toBe(true);
    expect(routineNodes.some((node) => node.id === "builtin.control.start")).toBe(true);
    expect(builtinAutomationNodeDefinitions.every((node) => node.origin === "builtin")).toBe(true);
  });

  it("keeps each built-in backed by a stable implementation key", async () => {
    const nodeIds = new Set<string>();
    for (const definition of builtinAutomationNodeDefinitions) {
      expect(nodeIds.has(definition.id)).toBe(false);
      nodeIds.add(definition.id);
      expect(definition.implementationKey).toBe(definition.id);
      expect(typeof definition.execute).toBe("function");
    }

    const add = getAutomationNodeDefinition("builtin.math.add");
    await expect(Promise.resolve(add?.execute?.({ inputs: { left: 2, right: 3 }, parameters: {} }))).resolves.toMatchObject({
      status: "success",
      outputs: { result: 5 }
    });
  });

  it("executes random number mode and range options", async () => {
    const randomNumber = getAutomationNodeDefinition("builtin.random.number");

    await expect(Promise.resolve(randomNumber?.execute?.({
      inputs: {},
      parameters: { min: 10, max: 20, mode: "integer", includeMax: true, precision: 0 },
      random: () => 0.5
    }))).resolves.toMatchObject({
      status: "success",
      outputs: { value: 15 }
    });

    await expect(Promise.resolve(randomNumber?.execute?.({
      inputs: {},
      parameters: { min: 0, max: 1, mode: "float", includeMax: false, precision: 3 },
      random: () => 0.4242
    }))).resolves.toMatchObject({
      status: "success",
      outputs: { value: 0.424 }
    });
  });

  it("gives every built-in node editable configuration", () => {
    for (const definition of builtinAutomationNodeDefinitions) {
      expect(definition.parameters.length, definition.id).toBeGreaterThan(0);
      for (const parameter of definition.parameters) {
        expect(parameter.id.length, `${definition.id}:${parameter.id}`).toBeGreaterThan(0);
        expect(parameter.label.length, `${definition.id}:${parameter.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("executes representative built-ins from every category", async () => {
    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.logic.compare")?.execute?.({
      inputs: { left: "FluxIQ", right: "flux" },
      parameters: { operator: "starts-with", caseSensitive: false }
    }))).resolves.toMatchObject({ route: "true", outputs: { result: true } });

    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.data.filter-list")?.execute?.({
      inputs: { items: [{ score: 2 }, { score: 8 }] },
      parameters: { path: "score", operator: "greater-than", value: 5 }
    }))).resolves.toMatchObject({ outputs: { items: [{ score: 8 }] } });

    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.control.switch")?.execute?.({
      inputs: { value: "ready" },
      parameters: { cases: [{ value: "ready", route: "go" }], defaultRoute: "fallback" }
    }))).resolves.toMatchObject({ route: "go" });

    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.timing.wait")?.execute?.({
      inputs: { in: "signal" },
      parameters: { duration: 2, unit: "seconds", jitterMs: 0 },
      random: () => 0.5
    }))).resolves.toMatchObject({ status: "waiting", outputs: { durationMs: 2000 } });

    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.policy.action")?.execute?.({
      inputs: { ready: true },
      parameters: { actionDefinitionId: "action.test", parameters: { ok: true }, timeoutMs: 3000 }
    }))).resolves.toMatchObject({ effects: [{ type: "policy.action.requested" }] });

    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.routine.task-policy")?.execute?.({
      inputs: { in: "start" },
      parameters: { taskId: "task-a", inputs: { target: "x" } }
    }))).resolves.toMatchObject({ effects: [{ type: "routine.task-policy.requested" }] });

    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.database.query")?.execute?.({
      inputs: {},
      parameters: { collection: "runs", where: { status: "ok" }, limit: 10 }
    }))).resolves.toMatchObject({ route: "records", effects: [{ type: "database.query.requested" }] });
  });
});
