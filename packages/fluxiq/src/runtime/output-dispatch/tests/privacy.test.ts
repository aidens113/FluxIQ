import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import { defineOutput, IoRegistry, type OutputDispatchResult } from "../../../io/index.ts";
import { FileRuntimeStore, FLUXIQ_RUNTIME_WITHHELD_VALUE, RuntimeService, type FluxIQRuntimeCommandAttempt, type FluxIQRuntimeCommandResult } from "../../index.ts";
import { createRuntimeOutputEffectDispatcher as createRuntimePolicyEffectDispatcher } from "../index.ts";
const effect = { type: "policy.output.dispatch", payload: { outputId: "activate-element", parameters: { elementId: "confirm" } } };
const action = { actionType: "activate-element", outputId: "activate-element", parameters: { elementId: "confirm" } };
function ioWith(dispatch?: () => OutputDispatchResult, metadata?: JsonObject): IoRegistry {
  const io = new IoRegistry();
  io.registerOutput("example", defineOutput({
    definition: { id: "activate-element", title: "Activate element", ...(metadata ? { metadata } : {}) },
    mode: "request",
    dispatch: dispatch ?? ((request) => ({ ok: true, outputId: request.outputId }))
  }));
  return io;
}
function runtimeReturning(result: Omit<FluxIQRuntimeCommandResult, "commandId">): RuntimeService {
  const runtime = new RuntimeService();
  runtime.registerAdapter({
    adapterId: "example.runtime",
    label: "Example Runtime",
    transport: "direct",
    domainId: "example",
    capabilities: () => [{ id: "example.outputs", kind: "action", domainId: "example", outputIds: ["activate-element"] }],
    execute: (command) => ({ commandId: command.commandId ?? "command.runtime", ...result })
  });
  return runtime;
}
/** Dispatches the shared effect, with `extra` merged into its payload, through a runtime that saves attempts under `root` and answers with `rows`. */
async function dispatchSavedRecords(root: string, rows: JsonObject[], extra: JsonObject) {
  const runtime = new RuntimeService({ store: new FileRuntimeStore({ rootDir: root }) });
  runtime.registerAdapter({
    adapterId: "example.runtime",
    label: "Example Runtime",
    transport: "direct",
    domainId: "example",
    capabilities: () => [{ id: "example.outputs", kind: "action", domainId: "example", outputIds: ["activate-element"] }],
    execute: (command) => ({ commandId: command.commandId ?? "command.runtime", status: "succeeded", payload: { rows } })
  });
  const result = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtime)({ type: effect.type, payload: { ...effect.payload, ...extra } });
  await runtime.ready();
  const [attempt] = runtime.commandAttemptsList();
  return { result, saved: await readFile(path.join(root, "command-attempts", attempt!.attemptId, "attempt.json"), "utf8") };
}
describe("a runtime-dispatched output's saved command attempt", () => {
  // Obviously synthetic: every assertion about it is where it must not appear.
  const SUPPLIED = "synthetic-policy-value-that-must-never-be-persisted";
  it("withholds the result payload of a dispatch that carries recordOutput, while the node's outputs keep the rows", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-io-policy-record-output-"));
    try {
      const rows = [{ name: SUPPLIED }];
      // Only the presence of recordOutput is read here; its shape is the policy action's to validate.
      const { result, saved } = await dispatchSavedRecords(root, rows, { recordOutput: { recordsPath: "rows" } });
      expect(result).toMatchObject({ status: "success", outputs: { ok: true, result: { rows } } });
      expect(saved).not.toContain(SUPPLIED);
      expect((JSON.parse(saved) as {
        attempt: FluxIQRuntimeCommandAttempt;
      }).attempt.result).toMatchObject({ status: "succeeded", payload: FLUXIQ_RUNTIME_WITHHELD_VALUE });
    }
    finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each([
    { carried: "no recordOutput", extra: {} },
    { carried: "a null recordOutput", extra: { recordOutput: null } }
  ])("keeps the result payload of a dispatch with $carried as the adapter returned it", async ({ extra }) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-io-policy-no-record-output-"));
    try {
      const rows = [{ name: "Synthetic catalog item" }];
      const { result, saved } = await dispatchSavedRecords(root, rows, extra);
      expect(result).toMatchObject({ status: "success", outputs: { ok: true, result: { rows } } });
      expect((JSON.parse(saved) as {
        attempt: FluxIQRuntimeCommandAttempt;
      }).attempt.result?.payload).toEqual({ rows });
    }
    finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
