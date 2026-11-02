import { describe, expect, it } from "vitest";
import { getAutomationNodeDefinition } from "../../registry.ts";
import {
  AUTOMATION_STUDIO_HANDLER_DISPOSITIONS,
  AUTOMATION_STUDIO_LIFECYCLE_EVENTS,
  automationStudioDispositionAllowedAt,
  controlFlowNodes
} from "../index.ts";

describe("handler and handler-end nodes", () => {
  it("are registered with the control-flow nodes", () => {
    expect(controlFlowNodes.map((node) => node.id)).toEqual(expect.arrayContaining(["builtin.control.handler", "builtin.control.handler-end"]));
    expect(getAutomationNodeDefinition("builtin.control.handler")?.class).toBe("control-flow");
    expect(getAutomationNodeDefinition("builtin.control.handler-end")?.class).toBe("control-flow");
  });

  it("offer exactly the lifecycle events and dispositions as options", () => {
    const handler = getAutomationNodeDefinition("builtin.control.handler");
    expect(handler?.parameters.find((parameter) => parameter.id === "event")?.options?.map((option) => option.value)).toEqual([...AUTOMATION_STUDIO_LIFECYCLE_EVENTS]);
    expect(handler?.outputs.map((port) => port.id)).toEqual(["body"]);
    const end = getAutomationNodeDefinition("builtin.control.handler-end");
    expect(end?.parameters.find((parameter) => parameter.id === "disposition")?.options?.map((option) => option.value)).toEqual([...AUTOMATION_STUDIO_HANDLER_DISPOSITIONS]);
  });

  it("answer with the routes the dispatcher reads", async () => {
    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.control.handler")?.execute?.({ inputs: {}, parameters: {} }))).resolves.toMatchObject({ status: "success", route: "body" });
    await expect(Promise.resolve(getAutomationNodeDefinition("builtin.control.handler-end")?.execute?.({ inputs: {}, parameters: { disposition: "route", checkpointId: "cart" } })))
      .resolves.toMatchObject({ status: "success", route: "success", outputs: { disposition: "route", checkpointId: "cart", outputs: {} } });
  });

  it("refuse resume at fail and resolve anywhere but fail", () => {
    for (const event of AUTOMATION_STUDIO_LIFECYCLE_EVENTS) {
      expect(automationStudioDispositionAllowedAt(event, "resume")).toBe(event !== "fail");
      expect(automationStudioDispositionAllowedAt(event, "resolve")).toBe(event === "fail");
      expect(automationStudioDispositionAllowedAt(event, "route")).toBe(true);
      expect(automationStudioDispositionAllowedAt(event, "unhandled")).toBe(true);
    }
  });
});
