import { describe, expect, it, vi } from "vitest";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionDeclaration } from "../../../action-permissions/index.ts";
import { beginAutomationStudioActionAssessment, runWithAutomationStudioActionAssessments, type AutomationStudioActionAssessmentTicket } from "../../../action-permissions/assessment-observation/index.ts";
import { automationStudioLlmRerunExecution, type AutomationStudioLlmRerunCaptureSnapshot, type AutomationStudioLlmRerunExecutionAccess, type AutomationStudioLlmRerunExecutor } from "../index.ts";
import { fixture, refused, success } from "./fixtures.ts";

const OBSERVE = { effectClass: "observe" as const, permissionConsequences: [] };
const STATE = { effectClass: "state" as const, permissionConsequences: [], repeatSafe: true as const };
const COMMIT = { effectClass: "commit" as const, permissionConsequences: [] };

describe("actual settled action safety", () => {
  it("retains owned immutable nonenumerable actual proof", async () => {
    const f = fixture();
    const record = await f.seal();
    expect(record.observedEffect).toEqual(OBSERVE);
    expect(Object.isFrozen(record.observedEffect)).toBe(true);
    expect(Object.isFrozen(record.observedEffect?.permissionConsequences)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(record, "observedEffect")).toMatchObject({ enumerable: false, writable: false, configurable: false });
    expect(JSON.stringify(record)).toBe("{}");
    expect({ ...record }).toEqual({});
  });

  it("preserves explicit state repeat proof through actual observation and execution", async () => {
    const f = fixture();
    const record = await f.seal("state", async (request) => {
      await f.assess(request, { effect: "mutate", actionEffect: STATE });
      return f.producer(request);
    });
    expect(record.observedEffect).toEqual(STATE);
    const outcome = await f.provenance.execute(record, { callId: "state-again" });
    expect(outcome.kind).toBe("returned");
    expect(outcome.main).toBe("receipt");
  });

  it.each([
    { effect: "mutate" as const, actionEffect: undefined, expected: { effectClass: "state", permissionConsequences: [] } },
    { effect: "observe" as const, actionEffect: COMMIT, expected: COMMIT }
  ])("never substitutes a safe canonical registry floor for actual unsafe evidence %#", async ({ effect, actionEffect, expected }) => {
    const f = fixture();
    const executor = vi.fn(async (request: Parameters<AutomationStudioLlmRerunExecutor>[0]) => {
      await f.assess(request, { effect, actionEffect });
      return f.producer(request);
    });
    const record = await f.seal("unsafe", executor);
    expect(record.observedEffect).toEqual(expected);
    const outcome = await f.provenance.execute(record, { callId: "unsafe-again" });
    expect(outcome).toEqual({ kind: "unavailable", reason: "assessment_unproven" });
    expect(outcome.main).toBe("unacted");
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it.each(["none", "auxiliary", "json"])("does not let %s proof establish an unchecked main", async (mode) => {
    const f = fixture();
    const record = await f.seal("unchecked", async (request) => {
      if (mode === "auxiliary") await f.assess({ ...request, callId: "auxiliary-call" });
      f.publish(mode === "json" ? Object.assign(f.snapshot(), { observedEffect: OBSERVE }) : f.snapshot());
      return mode === "json" ? { ...success(), evidence: { ok: true, observedEffect: OBSERVE } } : success();
    });
    if (mode === "json") expect(record.execution).toMatchObject({ evidence: { ok: true, observedEffect: OBSERVE } });
    expect(record).not.toHaveProperty("observedEffect");
    expect((await f.provenance.execute(record, { callId: "unchecked-again" })).main).toBe("unacted");
  });

  it("keeps an early commit despite later safe observations beyond the history cap", async () => {
    const f = fixture();
    const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", endsOnRequest: false });
    const record = await f.seal("long", async (request) => {
      const check = gate.checkFor({ kind: "exploration_step", id: request.toolId, ref: request.callId });
      const declaration: AutomationStudioActionDeclaration = { consequences: [], effect: "observe", control: { name: "Read inventory" }, verb: "read", actionEffect: OBSERVE };
      await check({ ...declaration, actionEffect: COMMIT });
      for (let index = 0; index < 501; index++) await check(declaration);
      return f.producer(request);
    });
    expect(gate.declarations).toHaveLength(500);
    expect(record.observedEffect).toEqual(COMMIT);
  });

  it("poisons an earlier refusal even after a later grant and successful wrapper", async () => {
    const f = fixture();
    const record = await f.seal("declined", async (request) => {
      const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", endsOnRequest: false });
      const check = gate.checkFor({ kind: "exploration_step", id: request.toolId, ref: request.callId });
      const action: AutomationStudioActionDeclaration = { consequences: ["delete"], effect: "mutate", control: { name: "Remove item" }, verb: "remove", actionEffect: COMMIT };
      expect((await check(action)).permitted).toBe(false);
      gate.settle("granted");
      expect((await check(action)).permitted).toBe(true);
      return f.producer(request);
    });
    expect(record).not.toHaveProperty("observedEffect");
  });

  it.each(["thrown", "pending", "duplicate"])("never loses a %s assessment swallowed by a successful wrapper", async (mode) => {
    const f = fixture();
    const record = await f.seal("unproven", async (request) => {
      if (mode === "thrown") {
        await expect(f.assess(request, { verb: "!" })).rejects.toThrow();
      } else {
        const ticket = beginAutomationStudioActionAssessment();
        if (mode === "duplicate") {
          ticket.settle({ effect: OBSERVE, permitted: true });
          ticket.settle({ effect: OBSERVE, permitted: true });
        }
      }
      return f.producer(request);
    });
    expect(record).not.toHaveProperty("observedEffect");
  });

  it("aggregates nested scopes conservatively while concurrent captures remain isolated", async () => {
    const outer = fixture();
    const parallel = fixture();
    const [unsafe, safe] = await Promise.all([
      outer.seal("outer", async (request) => {
        await outer.provenance.capture(outer.request("inner"), async (inner) => {
          await outer.assess(inner, { actionEffect: COMMIT });
          return outer.producer(inner);
        });
        return outer.producer(request);
      }),
      parallel.seal("parallel")
    ]);
    expect(unsafe.observedEffect).toEqual(COMMIT);
    expect(safe.observedEffect).toEqual(OBSERVE);
  });

  it("cannot amend a closed proof with a saved late finalizer", async () => {
    const f = fixture();
    let saved: AutomationStudioActionAssessmentTicket | undefined;
    const record = await f.seal("late", async (request) => {
      saved = beginAutomationStudioActionAssessment();
      return f.producer(request);
    });
    expect(record).not.toHaveProperty("observedEffect");
    saved?.settle({ effect: OBSERVE, permitted: true });
    expect(record).not.toHaveProperty("observedEffect");
    expect(Object.isFrozen(record)).toBe(true);
  });
});

describe("deny-only execution preflight and actual receipts", () => {
  it.each([
    { name: "commit without classes", original: OBSERVE, current: { actionEffect: COMMIT } },
    { name: "unsafe legacy mutation", original: OBSERVE, current: { effect: "mutate", actionEffect: undefined } },
    { name: "new stronger safe state", original: OBSERVE, current: { effect: "mutate", actionEffect: STATE } },
    { name: "lost repeat promise", original: STATE, current: { effect: "mutate", actionEffect: { effectClass: "state", permissionConsequences: [] } } },
    { name: "new destructive consequence", original: OBSERVE, current: { effect: "mutate", consequences: ["delete"], actionEffect: COMMIT } }
  ])("holds $name before dispatch or a new request", async ({ original, current }) => {
    const f = fixture();
    let rerunning = false;
    let dispatched = 0;
    const derive = vi.fn(async () => []);
    const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", endsOnRequest: false, deriveInstructed: derive });
    const record = await f.seal("before", async (request) => {
      if (!rerunning) {
        await f.assess(request, { effect: original.effectClass === "state" ? "mutate" : "observe", actionEffect: original });
        return f.producer(request);
      }
      const verdict = await gate.checkFor({ kind: "exploration_step", id: request.toolId, ref: request.callId })({
        consequences: [], control: { name: "Apply change" }, verb: "apply", effect: "observe", ...current
      } as AutomationStudioActionDeclaration);
      if (verdict.permitted) dispatched++;
      return refused();
    });
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "held" });
    expect(outcome.kind).toBe("unproven");
    expect(outcome.main).toBe("unacted");
    expect(dispatched).toBe(0);
    expect(gate.request).toBeUndefined();
    expect(derive).not.toHaveBeenCalled();
    if (outcome.kind === "unproven") expect(outcome.result).toMatchObject({ evidence: { ok: false } });
  });

  it("refuses capsule acknowledgement without a matching fresh primary assessment", async () => {
    const f = fixture();
    let rerunning = false;
    let consumption: unknown;
    const actual = refused();
    const record = await f.seal("original", async (request) => {
      if (!rerunning) return f.producer(request);
      const selected = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (selected.kind === "selected") consumption = selected.consume(selected.capsule);
      return actual;
    });
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "unchecked" });
    expect(consumption).toEqual({ kind: "refused", reason: "assessment_unproven" });
    expect(outcome.main).toBe("unacted");
    if (outcome.kind === "unproven") expect(outcome.result).toBe(actual);
  });

  it("cannot call capsule acknowledgement a fresh dispatch receipt", async () => {
    const f = fixture();
    let rerunning = false;
    const record = await f.seal("original", async (request) => {
      if (!rerunning) return f.producer(request);
      await f.assess(request);
      const selected = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (selected.kind === "selected") expect(selected.consume(selected.capsule).kind).toBe("consumed");
      return success();
    });
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "unreported" });
    expect(outcome).toEqual({ kind: "unproven", reason: "dispatch_unproven" });
    expect(outcome.main).toBe("unproven");
    expect(outcome.dispatch).toBeUndefined();
  });

  it.each(["succeeded", "failed_unacted", "uncertain", "unknown"] as const)("keeps a fresh %s receipt private and truthful", async (status) => {
    const f = fixture();
    let rerunning = false;
    const actual = status === "succeeded" ? success() : refused();
    const record = await f.seal("original", async (request) => {
      if (!rerunning) return f.producer(request);
      await f.assess(request);
      const selected = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (selected.kind === "selected") {
        selected.consume(selected.capsule);
        expect(f.report(selected, status)).toEqual({ kind: "accepted" });
      }
      return actual;
    });
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "reported" });
    expect(outcome.kind).toBe(status === "succeeded" ? "returned" : "unproven");
    expect(outcome.main).toBe("receipt");
    expect(outcome.dispatch?.attempts[0]?.outcome).toBe(status);
    expect(Object.keys(outcome)).not.toContain("main");
    expect(Object.keys(outcome)).not.toContain("dispatch");
    if (outcome.kind === "returned" || outcome.kind === "unproven") expect(outcome.result).toBe(actual);
  });

  it.each(["old-attempt", "old-receipt", "foreign-capsule", "duplicate"])("refuses %s reports without erasing a previously accepted receipt", async (mode) => {
    const f = fixture();
    let rerunning = false;
    const record = await f.seal("original", async (request) => {
      if (!rerunning) return f.producer(request);
      await f.assess(request);
      const selected = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (selected.kind !== "selected" || !selected.reportDispatch) return refused();
      selected.consume(selected.capsule);
      if (mode === "duplicate") f.report(selected);
      const identity = mode === "old-attempt" ? f.attempt : {};
      const dispatch: AutomationStudioLlmRerunCaptureSnapshot["dispatch"] = {
        attempts: [{ identity, receipt: mode === "old-receipt" ? f.receipt : {}, outcome: "succeeded" }], selected: identity
      };
      expect(selected.reportDispatch(mode === "foreign-capsule" ? {} : selected.capsule, dispatch).kind).toBe("refused");
      return success();
    });
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "bad-report" });
    expect(outcome.kind).toBe("unproven");
    expect(outcome.main).toBe(mode === "duplicate" ? "receipt" : "unproven");
    expect(outcome.dispatch !== undefined).toBe(mode === "duplicate");
  });

  it("retains an actual receipt and result when a later nested auxiliary check is vetoed", async () => {
    const f = fixture();
    let rerunning = false;
    const actual = success();
    const record = await f.seal("original", async (request) => {
      if (!rerunning) return f.producer(request);
      await f.assess(request);
      const selected = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (selected.kind === "selected") {
        selected.consume(selected.capsule);
        f.report(selected);
      }
      await runWithAutomationStudioActionAssessments({ observe: () => undefined }, async () => {
        expect((await f.assess({ ...request, callId: "auxiliary" }, { actionEffect: COMMIT })).permitted).toBe(false);
      });
      return actual;
    });
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "acted-then-held" });
    expect(outcome.kind).toBe("unproven");
    expect(outcome.main).toBe("receipt");
    expect(outcome.dispatch?.attempts).toHaveLength(1);
    if (outcome.kind === "unproven") expect(outcome.result).toBe(actual);
  });

  it("rejects reuse of a previously accepted actual report in a later member", async () => {
    const f = fixture();
    let rerunning = false;
    const identity = {};
    const report: AutomationStudioLlmRerunCaptureSnapshot["dispatch"] = {
      attempts: [{ identity, receipt: {}, outcome: "succeeded" }], selected: identity
    };
    const record = await f.seal("original", async (request) => {
      if (!rerunning) return f.producer(request);
      await f.assess(request);
      const selected = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (selected.kind === "selected") {
        selected.consume(selected.capsule);
        selected.reportDispatch?.(selected.capsule, report);
      }
      return success();
    });
    rerunning = true;
    expect((await f.provenance.execute(record, { callId: "first" })).main).toBe("receipt");
    const second = await f.provenance.execute(record, { callId: "second" });
    expect(second.kind).toBe("unproven");
    expect(second.main).toBe("unproven");
    expect(second.dispatch).toBeUndefined();
  });

  it("rejects a saved late report and never treats it as a fresh active execution", async () => {
    const f = fixture();
    let selected: Extract<AutomationStudioLlmRerunExecutionAccess, { kind: "selected" }> | undefined;
    const record = await f.seal("original", async (request) => {
      const access = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (access.kind === "selected") selected = access;
      return f.producer(request);
    });
    await f.provenance.execute(record, { callId: "reported" });
    const identity = {};
    expect(selected?.reportDispatch?.(selected.capsule, {
      attempts: [{ identity, receipt: {}, outcome: "succeeded" }], selected: identity
    })).toEqual({ kind: "refused", reason: "execution_closed" });
  });
});
