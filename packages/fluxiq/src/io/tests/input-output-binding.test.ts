import { expect, it, vi } from "vitest";
import type { IoEnvelope } from "../index.ts";
import { createEnvelope, defineInput, defineOutput, IoRegistry } from "../index.ts";

it("describes the actual original registered binding without projecting or dispatching, and resolves once", () => {
  const io = new IoRegistry();
  const project = vi.fn((_event: IoEnvelope) => ({ command: "activate" }));
  const dispatch = vi.fn(() => ({ ok: true, outputId: "activate" }));
  const binding = { outputId: " activate ", toPayload: project, recordInputPayload: true, metadata: { note: "binding" } };
  io.registerInput("example", defineInput({ definition: { id: " pressed ", title: "Pressed", role: "action", outputId: "activate" }, mode: "stream", outputBinding: binding }));
  io.registerOutput("example", defineOutput({ definition: { id: "activate", title: "Activate" }, mode: "request", dispatch }));
  const registered = io.getInput("example", "pressed");
  const descriptor = io.getRegisteredInputOutputBinding("example", "pressed");
  expect(descriptor?.inputDefinition).toBe(registered?.definition);
  expect(descriptor?.binding).toBe(binding);
  expect(descriptor?.outputId).toBe("activate");
  expect(project).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  const event = createEnvelope({ ioId: "pressed", payload: { original: true } });
  expect(io.resolveInputOutputBinding("example", "pressed", event)).toEqual({ outputId: "activate", payload: { command: "activate" }, confirmationInputId: "pressed", confirmationTimeoutMs: 5000, recordInputPayload: true, metadata: { note: "binding" } });
  expect(project).toHaveBeenCalledTimes(1);
  expect(project.mock.calls[0]?.[0]).toBe(event);
  expect(dispatch).not.toHaveBeenCalled();
});

it("keeps unknown, state, unmapped action and definition-only output inputs passive", () => {
  const io = new IoRegistry();
  const project = vi.fn(() => ({}));
  io.registerOutput("example", defineOutput({ definition: { id: "activate", title: "Activate" }, mode: "request", dispatch: () => ({ ok: true, outputId: "activate" }) }));
  io.registerInput("example", defineInput({ definition: { id: "state", title: "State", role: "state" }, mode: "stream" }));
  io.registerInput("example", defineInput({ definition: { id: "unmapped", title: "Unmapped", role: "action" }, mode: "stream" }));
  io.registerInput("example", defineInput({ definition: { id: "definition-only", title: "Definition only", role: "action", outputId: "activate" }, mode: "stream" }));
  for (const id of ["unknown", "state", "unmapped", "definition-only"]) expect(io.getRegisteredInputOutputBinding("example", id)).toBeNull();
  for (const id of ["state", "unmapped", "definition-only"]) expect(io.resolveInputOutputBinding("example", id, createEnvelope({ ioId: id, payload: {} }))).toBeNull();
  expect(() => io.resolveInputOutputBinding("example", "unknown", createEnvelope({ ioId: "unknown", payload: {} }))).toThrow("Input adapter not found");
  expect(project).not.toHaveBeenCalled();
});

it("refuses an unregistered binding output before its projector and preserves explicit no-confirmation", () => {
  const io = new IoRegistry();
  const project = vi.fn(() => ({ value: 1 }));
  io.registerInput("example", defineInput({ definition: { id: "pressed", title: "Pressed", role: "action", outputId: "missing" }, mode: "stream", outputBinding: { outputId: "missing", toPayload: project, confirmation: false } }));
  expect(() => io.getRegisteredInputOutputBinding("example", "pressed")).toThrow("unregistered output");
  expect(() => io.resolveInputOutputBinding("example", "pressed", createEnvelope({ ioId: "pressed", payload: {} }))).toThrow("unregistered output");
  expect(project).not.toHaveBeenCalled();
  io.registerOutput("example", defineOutput({ definition: { id: "missing", title: "Available now" }, mode: "request", dispatch: () => ({ ok: true, outputId: "missing" }) }));
  expect(io.resolveInputOutputBinding("example", "pressed", createEnvelope({ ioId: "pressed", payload: {} }))).toEqual({ outputId: "missing", payload: { value: 1 } });
  expect(project).toHaveBeenCalledTimes(1);
});
