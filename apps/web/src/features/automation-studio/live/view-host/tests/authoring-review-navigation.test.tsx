import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { useAutomationConnectorCommands, type AutomationConnectorCommandHandlers } from "../useAutomationConnectorCommands";
import { automationStudioViewId } from "../../../views/view-registry";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("Steps uses the current proposal navigation handler across connector updates", async () => {
  let commands!: ReturnType<typeof useAutomationConnectorCommands>;
  function Host({ openAdaptation }: { openAdaptation: (...args: any[]) => void }) {
    const handlers = new Proxy({ openAdaptation }, { get: (target, key) => key === "openAdaptation" ? target.openAdaptation : noop });
    commands = useAutomationConnectorCommands(handlers as AutomationConnectorCommandHandlers);
    return null;
  }
  const noop = () => undefined;
  const first = vi.fn();
  const next = vi.fn();
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<Host openAdaptation={first} />); });
  const navigate = (commands[automationStudioViewId.flowEditor] as any).onOpenAdaptation;
  expect(navigate).toBeTypeOf("function");
  navigate("flow.one", "proposal.one");
  expect(first).toHaveBeenCalledWith("flow.one", "proposal.one");
  await act(async () => renderer.update(<Host openAdaptation={next} />));
  expect((commands[automationStudioViewId.flowEditor] as any).onOpenAdaptation).toBe(navigate);
  navigate("flow.two", "proposal.two");
  expect(next).toHaveBeenCalledWith("flow.two", "proposal.two");
  expect(first).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});
