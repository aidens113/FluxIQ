import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import { defineDomainIo, defineInput, defineOutput, IoRegistry, type OutputDispatchResult } from "../../../io/index.ts";
import { RuntimeService, type FluxIQRuntimeCommandResult } from "../../index.ts";
import { createRuntimeOutputEffectDispatcher as createRuntimePolicyEffectDispatcher, dispatchRegisteredOutput as dispatchPolicyOutput } from "../index.ts";
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
describe("policy output dispatch failures", () => {
  it("retains measured target facts independently of IO/runtime success and failure", async () => {
    const actionability = { actionable: false, cause: "covered" } as const;
    for (const ok of [false, true]) {
      const result = await dispatchPolicyOutput(ioWith(() => ({ ok, outputId: "activate-element", actionability, payload: { actual: 1 } })), "example", action);
      expect(result).toMatchObject({ status: ok ? "success" : "failed", actionability, outputs: { ok, result: { actual: 1 } } });
      const runtimeResult = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: ok ? "succeeded" : "failed", actionability, payload: { actual: 2 } }))(effect);
      expect(runtimeResult).toMatchObject({ status: ok ? "success" : "failed", actionability, outputs: { ok, result: { actual: 2 } } });
    }
  });
  it("drops malformed/accessor target metadata alone and never invokes its getter", async () => {
    let reads = 0;
    const supplied = Object.defineProperty({ ok: true, outputId: "activate-element", payload: { actual: 1 } }, "actionability", {
      enumerable: true,
      get: () => {
        reads += 1;
        return { actionable: true };
      }
    });
    const result = await dispatchPolicyOutput(ioWith(() => supplied), "example", action);
    expect(reads).toBe(0);
    expect(result).toMatchObject({ status: "success", outputs: { result: { actual: 1 } } });
    expect(result).not.toHaveProperty("actionability");
    const malformed = { actionable: true, geometry: "PRIVATE_GEOMETRY" } as const;
    const runtimeResult = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "succeeded", actionability: malformed }))(effect);
    expect(runtimeResult).toMatchObject({ status: "success" });
    expect(runtimeResult).not.toHaveProperty("actionability");
  });
  it("passes the run reference to a runtime adapter while command timestamps stay live", async () => {
    const referenceNow = Date.UTC(2026, 9, 30, 23, 59, 59);
    const contexts: Array<{
      referenceNow?: number;
      now?: () => number;
    }> = [];
    let live = referenceNow + 2000;
    const runtime = new RuntimeService({ now: () => live++ });
    runtime.registerAdapter({
      adapterId: "reference.runtime", label: "Reference", transport: "direct", domainId: "example",
      capabilities: () => [{ id: "reference.outputs", kind: "action", domainId: "example", outputIds: ["activate-element"] }],
      execute: (command, context) => {
        contexts.push(context);
        return { commandId: command.commandId!, status: "succeeded" };
      }
    });
    const dispatcher = createRuntimePolicyEffectDispatcher(ioWith(), "example", runtime);
    expect((await dispatcher(effect, { referenceNow }))?.status).toBe("success");
    expect((await dispatcher(effect, { referenceNow: NaN }))?.status).toBe("success");
    expect(contexts.map((context) => context.referenceNow)).toEqual([referenceNow, undefined]);
    const attempts = runtime.commandAttemptsList();
    expect(attempts[0]!.dispatchedAt).toBeGreaterThan(referenceNow);
    expect(attempts[1]!.dispatchedAt).toBeGreaterThan(attempts[0]!.dispatchedAt);
  });
  it("names a timed-out runtime command a timeout without relying on its message", async () => {
    const result = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "timed_out", message: "The client did not answer." }))(effect);
    expect(result).toMatchObject({
      status: "failed",
      route: "failed",
      message: "The client did not answer.",
      failure: { category: "timeout", code: "output_dispatch.timed_out", retryable: true },
      outputs: { ok: false, runtimeStatus: "timed_out" }
    });
  });
  it("names a rejected runtime command a capability or policy block", async () => {
    const result = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "rejected", message: "Unsupported page." }))(effect);
    expect(result?.failure).toEqual({ category: "blocked_by_capability_or_policy", code: "output_dispatch.rejected", retryable: false, stage: "dispatch" });
  });
  it("keeps a valid host-reported failure and drops a malformed one", async () => {
    const hostFailure = { category: "target_ambiguous", code: "web.target.multiple_matches", retryable: true, stage: "target_resolution", expected: "1 match", actual: "3 matches" } as const;
    const reported = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "failed", message: "3 elements matched.", failure: hostFailure }))(effect);
    expect(reported?.failure).toEqual(hostFailure);
    const malformedTimeout = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "timed_out", failure: { ...hostFailure, stage: "execution" } }))(effect);
    expect(malformedTimeout?.failure).toMatchObject({ category: "timeout", code: "output_dispatch.timed_out" });
    const malformedFailure = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "failed", error: "boom", failure: { ...hostFailure, stage: "execution" } }))(effect);
    expect(malformedFailure).not.toHaveProperty("failure");
    expect(malformedFailure?.message).toBe("boom");
  });
  it("reads status and failure from IO output adapters", async () => {
    const timedOut = await dispatchPolicyOutput(ioWith(() => ({ ok: false, outputId: "activate-element", status: "timed_out", error: "No answer." })), "example", action);
    expect(timedOut).toMatchObject({ status: "failed", message: "No answer.", failure: { category: "timeout" } });
    const authFailure = { category: "auth_required", code: "web.auth.login_page", retryable: false } as const;
    const loginPage = await dispatchPolicyOutput(ioWith(() => ({ ok: false, outputId: "activate-element", error: "Login page.", failure: authFailure })), "example", action);
    expect(loginPage.failure).toEqual(authFailure);
    const plain = await dispatchPolicyOutput(ioWith(() => ({ ok: false, outputId: "activate-element", error: "Nope." })), "example", action);
    expect(plain).toMatchObject({ status: "failed", message: "Nope." });
    expect(plain).not.toHaveProperty("failure");
  });
  it("reports a dispatched output whose confirmation never arrived as not observed", async () => {
    const io = new IoRegistry();
    io.register(defineDomainIo({
      domainId: "example",
      inputs: [defineInput({
        definition: { id: "element-activated", title: "Element activated", role: "action", outputId: "activate-element" },
        mode: "stream",
        outputBinding: { outputId: "activate-element", toPayload: () => ({}) },
        subscribe: () => () => undefined
      })],
      outputs: [defineOutput({
        definition: { id: "activate-element", title: "Activate element" },
        mode: "request",
        dispatch: (request) => ({ ok: true, outputId: request.outputId, actionability: { actionable: true } })
      })]
    }));
    const result = await dispatchPolicyOutput(io, "example", { ...action, confirmationInputId: "element-activated", confirmationTimeoutMs: 5 });
    expect(result).toMatchObject({
      status: "failed",
      failure: { category: "output_not_observed", code: "output_confirmation.not_received", retryable: true, stage: "confirmation" },
      outputs: { confirmation: false }
    });
    expect(result.message).toContain("element-activated");
    expect(result.actionability).toEqual({ actionable: true });
    const runtimeResult = await createRuntimePolicyEffectDispatcher(io, "example", runtimeReturning({ status: "succeeded", actionability: { actionable: false, cause: "disabled" } }))({ type: effect.type, payload: { ...effect.payload, confirmationInputId: "element-activated", confirmationTimeoutMs: 5 } });
    expect(runtimeResult).toMatchObject({ status: "failed", actionability: { actionable: false, cause: "disabled" }, failure: { code: "output_confirmation.not_received", stage: "confirmation" } });
    expect(runtimeResult?.failure).not.toHaveProperty("effect");
    expect(runtimeResult?.failure).not.toHaveProperty("transient");
  });
});
describe("a wait the target reports clearing by itself", () => {
  it("is carried from an IO output result onto the node result, whether the dispatch succeeded or failed", async () => {
    const succeeded = await dispatchPolicyOutput(ioWith(() => ({ ok: true, outputId: "activate-element", clearedWait: { waitedMs: 2000 } })), "example", action);
    expect(succeeded).toMatchObject({ status: "success", clearedWait: { waitedMs: 2000 } });
    const failed = await dispatchPolicyOutput(ioWith(() => ({ ok: false, outputId: "activate-element", error: "Gone.", clearedWait: { waitedMs: 9 } })), "example", action);
    expect(failed).toMatchObject({ status: "failed", message: "Gone.", clearedWait: { waitedMs: 9 } });
  });
  it("is carried from a runtime command result onto the node result", async () => {
    const result = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "succeeded", clearedWait: { waitedMs: 5000 } }))(effect);
    expect(result).toMatchObject({ status: "success", clearedWait: { waitedMs: 5000 } });
  });
  it("stays absent when neither result reports one", async () => {
    expect(await dispatchPolicyOutput(ioWith(), "example", action)).not.toHaveProperty("clearedWait");
    expect(await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "succeeded" }))(effect)).not.toHaveProperty("clearedWait");
  });
});
describe("a route an output answers in its result payload", () => {
  it("is lifted onto a succeeded IO dispatch's route, with the outputs unchanged", async () => {
    const result = await dispatchPolicyOutput(ioWith(() => ({ ok: true, outputId: "activate-element", payload: { route: "ended" } })), "example", action);
    expect(result).toMatchObject({ status: "success", route: "ended", outputs: { ok: true, result: { route: "ended" } } });
  });
  it("is lifted onto a succeeded runtime dispatch's route", async () => {
    const result = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "succeeded", payload: { route: "ended" } }))(effect);
    expect(result).toMatchObject({ status: "success", route: "ended", outputs: { ok: true, result: { route: "ended" } } });
  });
  it("leaves a failed dispatch failed whatever its payload says", async () => {
    const io = await dispatchPolicyOutput(ioWith(() => ({ ok: false, outputId: "activate-element", error: "No.", payload: { route: "ended" } })), "example", action);
    const runtime = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "failed", error: "No.", payload: { route: "ended" } }))(effect);
    expect(io).toMatchObject({ status: "failed", route: "failed" });
    expect(runtime).toMatchObject({ status: "failed", route: "failed" });
  });
  it("ignores an empty, non-string, success or failed route", async () => {
    for (const route of ["", 3, "success", "failed", null]) {
      const result = await dispatchPolicyOutput(ioWith(() => ({ ok: true, outputId: "activate-element", payload: { route } })), "example", action);
      expect(result.route).toBe("success");
    }
  });
});
