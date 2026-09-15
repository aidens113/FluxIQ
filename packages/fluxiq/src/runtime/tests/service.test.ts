import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { COMMAND_ANSWER_MARGIN_MS } from "../../client-gateway/service/index.ts";
import {
  FileRuntimeStore,
  FLUXIQ_RUNTIME_WITHHELD_VALUE,
  RuntimeService,
  type FluxIQRuntimeCapability,
  type FluxIQRuntimeCommand,
  type FluxIQRuntimeCommandAttempt,
  type FluxIQRuntimeCommandResult,
  type FluxIQRuntimeExecutionContext,
  type FluxIQRuntimeTransport
} from "../index.ts";

// Obviously synthetic: every assertion about these is where they must not appear.
const SUPPLIED = "synthetic-runtime-value-that-must-never-be-persisted";
const SUPPLIED_NUMBER = 7310452;

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

  // `timeoutMs` is the time a target is given. A target that honours it answers
  // with its own timeout, and its own failure record, once that runs out, so the
  // runtime waits the answer margin longer before deciding it never answered.
  it.each(["adapter", "transport"] as const)("reports the %s target's own answer that arrives after its timeout but within the answer margin", async (targetKind) => {
    const runtime = new RuntimeService();
    const answer: Omit<FluxIQRuntimeCommandResult, "commandId"> = {
      status: "timed_out",
      message: "The target gave up after its own 20ms.",
      failure: { category: "timeout", code: "example.action.timeout", retryable: true }
    };
    registerLateTarget(runtime, targetKind, (command) => new Promise((resolve) => {
      setTimeout(() => resolve({ commandId: command.commandId ?? "command.late", ...answer }), 20 + 250);
    }));

    const result = await runtime.dispatch({ commandId: "command.late", kind: "execute_action", actionType: "late.run", timeoutMs: 20 });

    expect(result).toEqual({ commandId: "command.late", ...answer });
  });

  it.each(["adapter", "transport"] as const)("times out a silent %s only once its timeout and the answer margin have both passed", async (targetKind) => {
    vi.useFakeTimers();
    try {
      const runtime = new RuntimeService();
      registerLateTarget(runtime, targetKind, () => new Promise(() => undefined));
      let settled: FluxIQRuntimeCommandResult | undefined;
      const pending = runtime.dispatch({ commandId: "command.silent", kind: "execute_action", actionType: "late.run", timeoutMs: 20 })
        .then((result) => { settled = result; });

      await vi.advanceTimersByTimeAsync(20 + COMMAND_ANSWER_MARGIN_MS - 1);
      expect(settled, "the runtime is still waiting inside the answer margin").toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await pending;

      expect(settled).toMatchObject({ commandId: "command.silent", status: "timed_out", message: expect.stringContaining(`after ${20 + COMMAND_ANSWER_MARGIN_MS}ms`) });
      expect(settled).not.toHaveProperty("failure");
    } finally {
      vi.useRealTimers();
    }
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

  it("withholds a caller's withheld values from the attempt it keeps and saves, while the adapter executes the real ones", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-runtime-withheld-"));
    try {
      const runtime = new RuntimeService({ store: new FileRuntimeStore({ rootDir: root }) });
      const received: Array<{ command: FluxIQRuntimeCommand; context: FluxIQRuntimeExecutionContext }> = [];
      runtime.registerAdapter({
        adapterId: "typing",
        label: "Typing",
        transport: "direct",
        capabilities: () => [{ id: "typing.actions", kind: "action", actionTypes: ["typing.type"] }],
        execute: (command, context) => {
          received.push({ command, context });
          return { commandId: command.commandId ?? "command.typing", status: "failed", message: `Could not type ${SUPPLIED} into #field.`, error: `The page refused ${SUPPLIED}.` };
        }
      });
      const parameters = { selector: "#field", text: SUPPLIED, pin: SUPPLIED_NUMBER, retries: 3, notes: [{ sent: `typed ${SUPPLIED}` }] };

      const result = await runtime.dispatch(
        { commandId: "command.typing", kind: "execute_action", actionType: "typing.type", parameters },
        { withheldValues: { texts: [SUPPLIED], numbers: [SUPPLIED_NUMBER] } }
      );
      await runtime.ready();

      // What executes is unchanged: the adapter gets the real values and never the list, and so does the caller.
      expect(received).toHaveLength(1);
      expect(received[0]?.command.parameters).toEqual(parameters);
      expect(received[0]?.context).not.toHaveProperty("withheldValues");
      expect(result.message).toBe(`Could not type ${SUPPLIED} into #field.`);

      const [kept] = runtime.commandAttemptsList();
      const saved = await readFile(path.join(root, "command-attempts", kept!.attemptId, "attempt.json"), "utf8");
      expect(saved).not.toContain(SUPPLIED);
      const savedAttempt = (JSON.parse(saved) as { attempt: FluxIQRuntimeCommandAttempt }).attempt;
      expect(savedAttempt.command.parameters).toEqual({
        selector: "#field",
        text: FLUXIQ_RUNTIME_WITHHELD_VALUE,
        pin: FLUXIQ_RUNTIME_WITHHELD_VALUE,
        retries: 3,
        notes: [{ sent: `typed ${FLUXIQ_RUNTIME_WITHHELD_VALUE}` }]
      });
      expect(savedAttempt).toMatchObject({
        status: "failed",
        message: `Could not type ${FLUXIQ_RUNTIME_WITHHELD_VALUE} into #field.`,
        result: { message: `Could not type ${FLUXIQ_RUNTIME_WITHHELD_VALUE} into #field.`, error: `The page refused ${FLUXIQ_RUNTIME_WITHHELD_VALUE}.` }
      });
      // Withheld when built, so memory, snapshots, and disk hold the same attempt.
      expect(runtime.commandAttemptsList()).toEqual([savedAttempt]);
      expect((await runtime.snapshot()).commandAttempts).toEqual([savedAttempt]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps an attempt as dispatched when nothing usable is withheld", async () => {
    const runtime = new RuntimeService();
    runtime.registerAdapter({
      adapterId: "typing",
      label: "Typing",
      transport: "direct",
      capabilities: () => [{ id: "typing.actions", kind: "action", actionTypes: ["typing.type"] }],
      execute: (command) => ({ commandId: command.commandId ?? "command.typing", status: "succeeded", message: "Typed hello." })
    });

    await runtime.dispatch(
      { kind: "execute_action", actionType: "typing.type", parameters: { selector: "#field", text: "hello", retries: 3 } },
      { withheldValues: { texts: [""], numbers: [Number.NaN] } }
    );

    expect(runtime.commandAttemptsList()).toMatchObject([{ command: { parameters: { selector: "#field", text: "hello", retries: 3 } }, message: "Typed hello.", result: { message: "Typed hello." } }]);
  });

  it("withholds the result payload from the attempt it keeps and saves when asked, while the caller receives it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-runtime-withheld-payload-"));
    try {
      const runtime = new RuntimeService({ store: new FileRuntimeStore({ rootDir: root }) });
      const contexts: FluxIQRuntimeExecutionContext[] = [];
      const payload = { rows: [{ name: SUPPLIED, price: SUPPLIED_NUMBER }] };
      runtime.registerAdapter({
        adapterId: "extracting",
        label: "Extracting",
        transport: "direct",
        capabilities: () => [{ id: "extracting.actions", kind: "action", actionTypes: ["extracting.extract"] }],
        execute: (command, context) => {
          contexts.push(context);
          return { commandId: command.commandId ?? "command.extracting", status: "succeeded", message: "Extracted 1 row.", payload };
        }
      });

      const result = await runtime.dispatch(
        { commandId: "command.extracting", kind: "execute_action", actionType: "extracting.extract", parameters: { selector: "#list" } },
        { withheldResultPayload: true }
      );
      await runtime.ready();

      // The caller receives the payload, and the adapter is never handed the flag.
      expect(result.payload).toEqual(payload);
      expect(contexts).toHaveLength(1);
      expect(contexts[0]).not.toHaveProperty("withheldResultPayload");

      const [kept] = runtime.commandAttemptsList();
      const saved = await readFile(path.join(root, "command-attempts", kept!.attemptId, "attempt.json"), "utf8");
      expect(saved).not.toContain(SUPPLIED);
      const savedAttempt = (JSON.parse(saved) as { attempt: FluxIQRuntimeCommandAttempt }).attempt;
      // Only the payload is replaced; the command and the rest of the result are kept as given.
      expect(savedAttempt).toMatchObject({
        status: "succeeded",
        message: "Extracted 1 row.",
        command: { parameters: { selector: "#list" } },
        result: { commandId: "command.extracting", status: "succeeded", message: "Extracted 1 row.", payload: FLUXIQ_RUNTIME_WITHHELD_VALUE }
      });
      // Withheld when settled, so memory, snapshots, and disk hold the same attempt.
      expect(runtime.commandAttemptsList()).toEqual([savedAttempt]);
      expect((await runtime.snapshot()).commandAttempts).toEqual([savedAttempt]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("withholds a payload beside withheld values, keeps one it was not asked to withhold, and adds none where none came back", async () => {
    const runtime = new RuntimeService();
    const answers: Record<string, Omit<FluxIQRuntimeCommandResult, "commandId">> = {
      "command.both": { status: "failed", error: `Stopped at ${SUPPLIED}.`, payload: { rows: [{ name: SUPPLIED }] } },
      "command.unasked": { status: "succeeded", payload: { rows: [{ name: "Synthetic kept row" }] } },
      "command.empty": { status: "succeeded", message: "Nothing to extract." }
    };
    runtime.registerAdapter({
      adapterId: "extracting",
      label: "Extracting",
      transport: "direct",
      capabilities: () => [{ id: "extracting.actions", kind: "action", actionTypes: ["extracting.extract"] }],
      execute: (command) => ({ commandId: command.commandId ?? "command.extracting", ...(answers[command.commandId ?? ""] ?? { status: "rejected" }) })
    });

    await runtime.dispatch(
      { commandId: "command.both", kind: "execute_action", actionType: "extracting.extract", parameters: { text: SUPPLIED } },
      { withheldValues: { texts: [SUPPLIED], numbers: [] }, withheldResultPayload: true }
    );
    await runtime.dispatch({ commandId: "command.unasked", kind: "execute_action", actionType: "extracting.extract" });
    await runtime.dispatch({ commandId: "command.empty", kind: "execute_action", actionType: "extracting.extract" }, { withheldResultPayload: true });

    const attempts = runtime.commandAttemptsList();
    expect(attempts.map((attempt) => attempt.result)).toEqual([
      { commandId: "command.both", status: "failed", error: `Stopped at ${FLUXIQ_RUNTIME_WITHHELD_VALUE}.`, payload: FLUXIQ_RUNTIME_WITHHELD_VALUE },
      { commandId: "command.unasked", status: "succeeded", payload: { rows: [{ name: "Synthetic kept row" }] } },
      { commandId: "command.empty", status: "succeeded", message: "Nothing to extract." }
    ]);
    expect(attempts[2]?.result).not.toHaveProperty("payload");
  });
});

/** One target for `late.run`, as a direct adapter or as a ready transport client, answering however `answer` does. */
function registerLateTarget(
  runtime: RuntimeService,
  targetKind: "adapter" | "transport",
  answer: (command: FluxIQRuntimeCommand) => Promise<FluxIQRuntimeCommandResult>
): void {
  const capabilities: FluxIQRuntimeCapability[] = [{ id: "late.actions", kind: "action", actionTypes: ["late.run"] }];
  if (targetKind === "adapter") {
    runtime.registerAdapter({ adapterId: "late", label: "Late", transport: "direct", capabilities: () => capabilities, execute: answer });
    return;
  }
  runtime.registerTransport({
    transportId: "late",
    label: "Late",
    kind: "websocket",
    clients: () => [{ clientId: "late.client", label: "Late client", transport: "websocket", status: "ready", capabilities }],
    dispatch: answer,
    onEvent: () => () => undefined
  });
}
