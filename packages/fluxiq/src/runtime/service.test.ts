import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FluxIQRuntimeTransport } from "./contracts.ts";
import { RuntimeService } from "./service.ts";
import { FileRuntimeStore } from "./storage.ts";

describe("RuntimeService", () => {
  it("registers direct adapters and exposes their capabilities", async () => {
    const runtime = new RuntimeService({ runtimeId: "runtime.test" });
    runtime.registerAdapter({
      adapterId: "example.direct",
      label: "Example Direct Runtime",
      transport: "direct",
      domainId: "example",
      capabilities: () => [{ id: "example.action", kind: "action", domainId: "example", actionTypes: ["example.run"] }],
      execute: (command) => ({ commandId: command.commandId ?? "command.test", status: "succeeded" })
    });

    const snapshot = await runtime.snapshot();

    expect(snapshot.runtimeId).toBe("runtime.test");
    expect(snapshot.adapters).toMatchObject([{ adapterId: "example.direct", domainId: "example" }]);
    expect(snapshot.clients).toMatchObject([{ clientId: "adapter:example.direct", status: "ready" }]);
    expect(snapshot.capabilities).toMatchObject([{ id: "example.action", kind: "action" }]);
  });

  it("registers transports and forwards transport events", async () => {
    const events: string[] = [];
    const transport: FluxIQRuntimeTransport = {
      transportId: "gateway",
      label: "Gateway",
      kind: "websocket",
      clients: () => [{
        clientId: "extension",
        label: "Extension",
        transport: "websocket",
        status: "ready",
        capabilities: [{ id: "web.actions", kind: "action", actionTypes: ["web.dom.click"] }]
      }],
      dispatch: (command) => Promise.resolve({ commandId: command.commandId ?? "command.gateway", status: "succeeded" }),
      onEvent: (handler) => {
        void handler({
          type: "client.ready",
          client: {
            clientId: "extension",
            label: "Extension",
            transport: "websocket",
            status: "ready",
            capabilities: []
          }
        });
        return () => {
          events.push("unsubscribed");
        };
      }
    };
    const runtime = new RuntimeService();
    runtime.onEvent((event) => {
      events.push(event.type);
    });

    runtime.registerTransport(transport);
    const snapshot = await runtime.snapshot();

    expect(events).toEqual(["client.ready"]);
    expect(snapshot.transports).toMatchObject([{ transportId: "gateway", kind: "websocket" }]);
    expect(snapshot.clients).toMatchObject([{ clientId: "extension", transport: "websocket" }]);
    expect(snapshot.capabilities).toMatchObject([{ id: "web.actions", kind: "action" }]);

    expect(runtime.unregisterTransport("gateway")).toBe(true);
    expect(events).toEqual(["client.ready", "unsubscribed"]);
  });

  it("rejects duplicate adapter and transport ids", () => {
    const runtime = new RuntimeService();
    const adapter = {
      adapterId: "duplicate",
      label: "Duplicate",
      transport: "direct" as const,
      capabilities: () => [],
      execute: () => ({ commandId: "command", status: "succeeded" as const })
    };
    const transport: FluxIQRuntimeTransport = {
      transportId: "duplicate",
      label: "Duplicate",
      kind: "websocket",
      clients: () => [],
      dispatch: (command) => Promise.resolve({ commandId: command.commandId ?? "command", status: "succeeded" }),
      onEvent: () => {
        return () => undefined;
      }
    };

    runtime.registerAdapter(adapter);
    runtime.registerTransport(transport);

    expect(() => runtime.registerAdapter(adapter)).toThrow("Duplicate runtime adapter");
    expect(() => runtime.registerTransport(transport)).toThrow("Duplicate runtime transport");
  });

  it("creates queued runs and includes them in snapshots", async () => {
    const runtime = new RuntimeService({ now: () => 123 });
    const events: string[] = [];
    runtime.onEvent((event) => {
      events.push(event.type);
    });

    const run = runtime.createRun({
      runId: "run.test",
      projectId: "project",
      domainId: "example",
      targetKind: "flow",
      targetId: "flow.test"
    });

    expect(run).toMatchObject({ runId: "run.test", status: "queued", queuedAt: 123 });
    expect(runtime.getRun("run.test")).toMatchObject({ targetId: "flow.test" });
    expect((await runtime.snapshot()).runs).toMatchObject([{ runId: "run.test", projectId: "project" }]);
    expect(events).toEqual(["run.queued"]);
  });

  it("dispatches commands through direct adapters and records attempts on runs", async () => {
    let now = 100;
    const runtime = new RuntimeService({ now: () => now });
    const events: string[] = [];
    runtime.onEvent((event) => {
      events.push(event.type);
    });
    runtime.registerAdapter({
      adapterId: "example.direct",
      label: "Example Direct",
      transport: "direct",
      domainId: "example",
      capabilities: () => [{ id: "example.actions", kind: "action", domainId: "example", actionTypes: ["example.run"] }],
      execute: (command) => ({
        commandId: command.commandId ?? "missing",
        status: "succeeded",
        payload: { accepted: true }
      })
    });
    const run = runtime.createRun({ runId: "run.dispatch", targetKind: "flow", targetId: "flow.dispatch", domainId: "example" });
    now = 150;

    const result = await runtime.dispatch({
      kind: "execute_action",
      domainId: "example",
      actionType: "example.run",
      parameters: { value: 1 }
    }, { runId: run.runId });

    expect(result).toMatchObject({ status: "succeeded", payload: { accepted: true } });
    expect(runtime.getRun(run.runId)).toMatchObject({
      status: "succeeded",
      transport: "direct",
      commandIds: [result.commandId]
    });
    expect(runtime.commandAttemptsList()).toMatchObject([{
      commandId: result.commandId,
      status: "succeeded",
      adapterId: "example.direct",
      transport: "direct"
    }]);
    expect(events).toEqual(["run.queued", "run.started", "command.dispatched", "command.result", "run.finished"]);
  });

  it("rejects commands without a matching runtime target", async () => {
    const runtime = new RuntimeService();

    await expect(runtime.dispatch({
      commandId: "command.missing",
      kind: "execute_action",
      domainId: "example",
      actionType: "example.run"
    })).resolves.toMatchObject({
      commandId: "command.missing",
      status: "rejected",
      error: "No runtime adapter or transport client matches the requested command."
    });
    expect(runtime.commandAttemptsList()).toMatchObject([{ commandId: "command.missing", status: "rejected" }]);
  });

  it("times out commands through slow adapters", async () => {
    const runtime = new RuntimeService({ now: () => 200 });
    runtime.registerAdapter({
      adapterId: "slow",
      label: "Slow",
      transport: "direct",
      capabilities: () => [{ id: "slow.actions", kind: "action", actionTypes: ["slow.run"] }],
      execute: () => new Promise(() => undefined)
    });

    await expect(runtime.dispatch({
      commandId: "command.slow",
      kind: "execute_action",
      actionType: "slow.run",
      timeoutMs: 1
    })).resolves.toMatchObject({
      commandId: "command.slow",
      status: "timed_out"
    });
  });

  it("cancels commands before dispatch work settles", async () => {
    const runtime = new RuntimeService();
    runtime.registerAdapter({
      adapterId: "cancel",
      label: "Cancel",
      transport: "direct",
      capabilities: () => [{ id: "cancel.actions", kind: "action", actionTypes: ["cancel.run"] }],
      execute: () => ({ commandId: "command.cancel", status: "succeeded" })
    });
    const controller = new AbortController();
    controller.abort();

    await expect(runtime.dispatch({
      commandId: "command.cancel",
      kind: "execute_action",
      actionType: "cancel.run"
    }, { signal: controller.signal })).resolves.toMatchObject({
      commandId: "command.cancel",
      status: "cancelled"
    });
  });

  it("persists runtime runs and command attempts through the file store", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-runtime-"));
    try {
      const store = new FileRuntimeStore({ rootDir: root });
      const runtime = new RuntimeService({ store });
      runtime.registerAdapter({
        adapterId: "persisted",
        label: "Persisted",
        transport: "direct",
        capabilities: () => [{ id: "persisted.actions", kind: "action", actionTypes: ["persisted.run"] }],
        execute: (command) => ({ commandId: command.commandId ?? "command.persisted", status: "succeeded" })
      });
      const run = runtime.createRun({ runId: "run.persisted", targetKind: "flow", targetId: "flow.persisted" });

      const result = await runtime.dispatch({ commandId: "command.persisted", kind: "execute_action", actionType: "persisted.run" }, { runId: run.runId });
      await runtime.ready();
      const reloaded = new RuntimeService({ store });
      await reloaded.ready();

      expect(result.status).toBe("succeeded");
      expect(reloaded.getRun("run.persisted")).toMatchObject({ runId: "run.persisted", status: "succeeded", commandIds: ["command.persisted"] });
      expect(reloaded.commandAttemptsList()).toMatchObject([{ commandId: "command.persisted", status: "succeeded", adapterId: "persisted" }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
