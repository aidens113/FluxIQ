import { expect, it, vi } from "vitest";
import { ClientGatewayCommandContext } from "../../../client-gateway/service/command-ledger/index.ts";
import { defineInput, defineOutput, IoRegistry, type OutputDispatchRequest } from "../../../io/index.ts";
import { createRuntimeOutputEffectDispatcher, dispatchRegisteredOutput, type OutputDispatchRuntime, type OutputTargetPreparer } from "../index.ts";
function registry(dispatch = vi.fn((_request: OutputDispatchRequest) => ({ ok: true, outputId: "device.set" }))) {
  const io = new IoRegistry();
  const definition = { id: "device.set", title: "Set device", metadata: { elementTarget: true } };
  io.registerOutput("device", defineOutput({ definition, mode: "request", dispatch }));
  return { io, definition, dispatch };
}
it("passes opaque parameters through unchanged without a preparer, including target-shaped data", async () => {
  const { io, dispatch } = registry();
  const parameters = { target: { kind: "custom", fingerprint: { opaque: "domain-owned" } }, empty: [] };
  const action = { outputId: "device.set", actionType: "device.set", parameters, metadata: { empty: [], original: true } };
  const result = await dispatchRegisteredOutput(io, "device", action);
  expect(result).toMatchObject({ status: "success", outputs: { outputId: "device.set" } });
  expect(result).not.toHaveProperty("targetResolution");
  expect(dispatch.mock.calls[0]?.[0].payload).toBe(parameters);
  expect(dispatch.mock.calls[0]?.[0].metadata).toEqual({ original: true });
  expect(action.metadata.empty).toEqual([]);
  expect(Object.isFrozen(parameters)).toBe(false);
});
it("keeps verified output and original confirmation even when a JS preparer returns extra fields", async () => {
  const events: string[] = [];
  const io = new IoRegistry();
  let confirm: () => void = () => {
    throw new Error("confirmation not armed");
  };
  io.registerInput("device", defineInput({
    definition: { id: "confirmed", title: "Confirmed" }, mode: "stream",
    subscribe: (handler) => {
      events.push("armed");
      confirm = () => handler({ id: "confirmation", ioId: "confirmed", sequence: 1, timestampMs: 1, payload: {} });
      return () => {
        events.push("unsubscribed");
      };
    }
  }));
  const definition = { id: "device.set", title: "Set device" };
  io.registerOutput("device", defineOutput({
    definition, mode: "request", dispatch: (request) => {
      events.push("dispatch");
      expect(request.outputId).toBe("device.set");
      expect(request.payload).toEqual({ prepared: true });
      confirm();
      return { ok: true, outputId: request.outputId };
    }
  }));
  const parameters = { original: true };
  const metadata = { clientId: "original-client" };
  const preparer: OutputTargetPreparer = (input) => {
    expect(Object.keys(input).sort()).toEqual(["action", "domainId", "output"]);
    expect(Object.keys(input.action).sort()).toEqual(["actionType", "confirmationInputId", "confirmationTimeoutMs", "metadata", "outputId", "parameters"]);
    expect(input.output).toBe(definition);
    expect(Object.isFrozen(input.action)).toBe(true);
    expect(input.action.parameters).toBe(parameters);
    expect(input.action.metadata).toBe(metadata);
    return { ok: true, parameters: { prepared: true }, outputId: "other", actionType: "other", confirmationInputId: "wrong", confirmationTimeoutMs: 0, metadata: { clientId: "other" } };
  };
  const action = { outputId: "device.set", actionType: "device.set", parameters, metadata, confirmationInputId: "confirmed", confirmationTimeoutMs: 100, extra: "never exposed" };
  const result = await dispatchRegisteredOutput(io, "device", action, undefined, undefined, preparer);
  expect(result).toMatchObject({ status: "success", outputs: { outputId: "device.set", confirmationInputId: "confirmed", confirmation: true } });
  expect(events).toEqual(["armed", "dispatch", "unsubscribed"]);
  expect(Object.isFrozen(parameters)).toBe(false);
  expect(Object.isFrozen(metadata)).toBe(false);
});
it("checks registration before preparation and preserves explicit refusal or exception before dispatch", async () => {
  const { io, dispatch } = registry();
  const prepare = vi.fn<OutputTargetPreparer>(() => ({ ok: true }));
  const action = { outputId: "missing", actionType: "missing", parameters: {} };
  expect((await dispatchRegisteredOutput(io, "device", action, undefined, undefined, prepare)).failure?.code).toBe("output_dispatch.output_not_registered");
  expect(prepare).not.toHaveBeenCalled();
  const refusal: OutputTargetPreparer = () => ({ ok: false, error: "target refused", failure: { category: "target_not_found", code: "device.target.refused", retryable: true, stage: "target_resolution" } });
  expect(await dispatchRegisteredOutput(io, "device", { ...action, outputId: "device.set" }, undefined, undefined, refusal)).toMatchObject({ status: "failed", message: "target refused", outputs: { outputId: "device.set" }, failure: { code: "device.target.refused" } });
  await expect(dispatchRegisteredOutput(io, "device", { ...action, outputId: "device.set" }, undefined, undefined, () => {
    throw new Error("preparer failed");
  })).rejects.toThrow("preparer failed");
  expect(dispatch).not.toHaveBeenCalled();
});
it("retains runtime fallback's two preparations and their order", async () => {
  const order: string[] = [];
  const io = new IoRegistry();
  io.registerOutput("device", defineOutput({
    definition: { id: "device.set", title: "Set device" }, mode: "request", dispatch: (request) => {
      order.push("dispatch");
      expect(request.payload).toEqual({ pass: 2 });
      expect(request.metadata).toEqual({ elementTargetResolution: { pass: 2 } });
      return { ok: true, outputId: request.outputId };
    }
  }));
  let pass = 0;
  const prepare: OutputTargetPreparer = ({ action }) => {
    pass += 1;
    order.push(`prepare:${pass}`);
    if (pass === 2)
      expect(action.parameters).toEqual({ pass: 1 });
    return { ok: true, parameters: { pass }, diagnostics: { pass } };
  };
  const dispatch = vi.fn();
  const runtime: OutputDispatchRuntime = {
    capabilities: async () => {
      order.push("capabilities");
      return [{ id: "different-domain", kind: "action", domainId: "other", outputIds: ["device.set"] }];
    }, dispatch
  };
  const result = await createRuntimeOutputEffectDispatcher(io, "device", runtime, prepare)({ type: "policy.output.dispatch", payload: { outputId: "device.set", parameters: {} } });
  expect(result).toMatchObject({ status: "success", outputs: { elementTargetResolution: { pass: 2 } } });
  expect(order).toEqual(["prepare:1", "capabilities", "prepare:2", "dispatch"]);
  expect(dispatch).not.toHaveBeenCalled();
});
it("forwards original context, routing, deadline, reference and withholding through the runtime port", async () => {
  const { io } = registry();
  const commandContext = ClientGatewayCommandContext.issue({ projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invocation.1", attemptId: "attempt.1", effectOrdinal: 0 });
  const signal = new AbortController().signal;
  const withheldValues = { texts: ["synthetic-private-value"], numbers: [17] };
  const dispatch = vi.fn<OutputDispatchRuntime["dispatch"]>(async () => ({ commandId: "command.1", status: "succeeded" }));
  const runtime: OutputDispatchRuntime = { capabilities: async () => [{ id: "action", kind: "action", domainId: "device", actionTypes: ["device.set"] }], dispatch };
  const result = await createRuntimeOutputEffectDispatcher(io, "device", runtime)({ type: "policy.output.dispatch", payload: { outputId: " device.set ", parameters: {}, timeoutMs: 123, recordOutput: {}, metadata: { clientId: "client.1", sessionId: "session.1" } } }, { signal, commandContext, referenceNow: 1, withheldValues });
  expect(result).toMatchObject({ status: "success", outputs: { outputId: "device.set" } });
  expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ outputId: "device.set", actionType: "device.set", timeoutMs: 123 });
  const context = dispatch.mock.calls[0]?.[1];
  expect(context).toMatchObject({ preferredClientId: "client.1", preferredSessionId: "session.1", referenceNow: 1, withheldResultPayload: true });
  expect(context?.commandContext).toBe(commandContext);
  expect(context?.signal).toBe(signal);
  expect(context?.withheldValues).toBe(withheldValues);
});
