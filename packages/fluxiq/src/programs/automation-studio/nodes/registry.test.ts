import { describe, expect, it } from "vitest";
import { automationNodeClassGroups, automationNodeClasses, builtinAutomationNodeDefinitions, getAutomationNodeDefinitions } from "./registry";

describe("automation node registry", () => {
  it("groups built-in node definitions by stable domain-neutral classes", () => {
    expect(automationNodeClasses).toContain("control-flow");
    expect(automationNodeClasses).toContain("math");
    expect(automationNodeClasses).toContain("random");
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
});
