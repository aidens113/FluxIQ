import { describe, expect, it } from "vitest";
import { automationConnectionIsValid, automationPortCaption, automationPortTitle, automationPortTypesCompatible } from "./ports";

describe("Automation graph ports", () => {
  it("accepts compatible typed ports and rejects incompatible or self connections", () => {
    const nodes = [
      { id: "source", position: { x: 0, y: 0 }, data: { outputs: [{ id: "number", label: "Number", valueType: "number" }], inputs: [] } },
      { id: "target", position: { x: 0, y: 0 }, data: { outputs: [], inputs: [{ id: "number-in", label: "Number", valueType: "number" }, { id: "text-in", label: "Text", valueType: "string" }] } }
    ] as any;
    expect(automationConnectionIsValid({ source: "source", target: "target", sourceHandle: "number", targetHandle: "number-in" }, nodes)).toBe(true);
    expect(automationConnectionIsValid({ source: "source", target: "target", sourceHandle: "number", targetHandle: "text-in" }, nodes)).toBe(false);
    expect(automationConnectionIsValid({ source: "source", target: "source", sourceHandle: "number", targetHandle: "number" }, nodes)).toBe(false);
  });

  it("keeps explicit any/signal compatibility and readable port labels", () => {
    expect(automationPortTypesCompatible("any", "object")).toBe(true);
    expect(automationPortTypesCompatible("signal", "boolean")).toBe(true);
    expect(automationPortCaption({ id: "result", label: "Result", valueType: "object" }, "source")).toBe("object");
    expect(automationPortTitle({ id: "failed", label: "Failed", valueType: "any", role: "failure" }, "source")).toBe("Failed - route");
  });
});