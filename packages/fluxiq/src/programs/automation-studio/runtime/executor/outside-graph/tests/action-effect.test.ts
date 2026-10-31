import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../../nodes/index.ts";
import { automationStudioDispatchWithNodeRetries, type AutomationStudioNodeRetryReading } from "../index.ts";

const COMMIT: AutomationStudioResolvedActionEffect = { effectClass: "commit", permissionConsequences: [] };
const node: AutomationStudioFlowNode = { id: "apply", definitionId: "example.apply", metadata: { effect: "observe", idempotent: true, declaredConsequences: [], actionEffect: { effectClass: "observe" } } };
const UNKNOWN: AutomationStudioFailureRecord = { category: "timeout", code: "example.timeout", retryable: true, stage: "execution" };

describe("trusted floors outside a graph", () => {
  it("retries an explicitly safe state setter at execution and verification, unless it declared a lasting consequence", async () => {
    const actionEffect: AutomationStudioResolvedActionEffect = { effectClass: "state", permissionConsequences: [], repeatSafe: true };
    for (const stage of ["execution", "verification"] as const) {
      const dispatch = vi.fn(async (attempt: number): Promise<AutomationStudioNodeRetryReading> => attempt < 3 ? { ok: false, failure: { ...UNKNOWN, stage } } : { ok: true });
      const outcome = await automationStudioDispatchWithNodeRetries({ node, actionEffect, dispatch, read: (value) => value, delay: async () => undefined });
      expect(outcome.attempts).toBe(3);
      expect(outcome.result.ok).toBe(true);
      expect(outcome.lastingAct).toBeUndefined();
      const declared = { ...node, metadata: { ...node.metadata, declaredConsequences: ["modify_existing"] } };
      const held = await automationStudioDispatchWithNodeRetries({ node: declared, actionEffect, dispatch, read: (value) => value, delay: async () => undefined });
      expect(held.attempts).toBe(1);
      expect(held.lastingAct).toBe("uncertain");
    }
  });

  it("holds a bare or timed-out failure despite authored observation and idempotency claims", async () => {
    for (const result of [{ ok: false } as const, { ok: false, failure: UNKNOWN } as const]) {
      const dispatch = vi.fn(async () => result);
      const outcome = await automationStudioDispatchWithNodeRetries({ node, actionEffect: COMMIT, dispatch, read: (value) => value, delay: async () => undefined });
      expect(outcome).toMatchObject({ attempts: 1, lastingAct: "uncertain" });
      expect(dispatch).toHaveBeenCalledTimes(1);
    }
  });

  it("preserves landed and not-landed proof, including all three retries", async () => {
    for (const verdict of ["landed", "unknown", "not_landed"] as const) {
      const dispatch = vi.fn(async (): Promise<AutomationStudioNodeRetryReading> => ({ ok: false, failure: UNKNOWN }));
      const outcome = await automationStudioDispatchWithNodeRetries({ node, actionEffect: COMMIT, dispatch, read: (value) => value, checkEffect: async () => verdict, delay: async () => undefined });
      expect(dispatch).toHaveBeenCalledTimes(verdict === "not_landed" ? 4 : 1);
      if (verdict !== "not_landed") expect(outcome.lastingAct).toBe(verdict === "landed" ? "landed" : "uncertain");
    }
    const dispatch = vi.fn(async (): Promise<AutomationStudioNodeRetryReading> => ({ ok: false, failure: { ...UNKNOWN, effect: "unacted" } }));
    const outcome = await automationStudioDispatchWithNodeRetries({ node, actionEffect: COMMIT, dispatch, read: (value) => value, delay: async () => undefined });
    expect(outcome.attempts).toBe(4);
    expect(outcome.lastingAct).toBeUndefined();
  });

  it("rejects malformed trusted contracts before dispatch and never retries an unconverted throw", async () => {
    const invalid: AutomationStudioResolvedActionEffect = { ...COMMIT };
    Object.assign(invalid, { permissionConsequences: ["delete", "unknown"] });
    const dispatch = vi.fn(async (): Promise<AutomationStudioNodeRetryReading> => { throw new Error("Lost reply."); });
    await expect(automationStudioDispatchWithNodeRetries({ node, actionEffect: invalid, dispatch, read: (value) => value })).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
    await expect(automationStudioDispatchWithNodeRetries({ node, actionEffect: COMMIT, dispatch, read: (value) => value })).rejects.toThrow("Lost reply.");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("ignores metadata-only contract spoofing and preserves truthful legacy read retries", async () => {
    const dispatch = vi.fn(async (): Promise<AutomationStudioNodeRetryReading> => ({ ok: false, failure: UNKNOWN }));
    const outcome = await automationStudioDispatchWithNodeRetries({ node, dispatch, read: (value) => value, delay: async () => undefined });
    expect(outcome.attempts).toBe(4);
    expect(outcome.lastingAct).toBeUndefined();
  });
});
