import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  automationStudioLlmRerunCapture,
  automationStudioLlmRerunExecution,
  createAutomationStudioLlmRerunProvenance,
  type AutomationStudioLlmRerunCaptureAccess,
  type AutomationStudioLlmRerunCaptureSnapshot,
  type AutomationStudioLlmRerunExecutionAccess,
  type AutomationStudioLlmRerunExecutor,
  type AutomationStudioLlmRerunRecord,
  type AutomationStudioLlmRerunResult
} from "../index.ts";
import { fixture, refused, scope, success } from "./fixtures.ts";

describe("Core-private rerun capture", () => {
  it("does not let ordinary JSON, ranWith or a capsule-shaped field mint authority", async () => {
    const f = fixture();
    await f.provenance.capture(f.request("forged"), async () => ({
      ...success(),
      draft: { ranWith: { node: "warehouse.shelves", parameters: f.parameters } }
    }));
    expect(f.provenance.lookup("forged")).toEqual({ kind: "unavailable", reason: "capture_missing" });
    expect(automationStudioLlmRerunCapture()).toEqual({ kind: "unavailable", reason: "inactive" });
    expect(automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: {
      ...f.value, frozen: true, capsule: { privatePayload: "private-command-payload" }
    } })).toEqual({ kind: "ordinary" });
  });

  it("cannot seal a provisional capture before the outer wrapper settles", async () => {
    const f = fixture();
    await f.provenance.capture(f.request("outer"), async () => {
      expect(f.publish(f.snapshot())).toEqual({ kind: "accepted" });
      expect(f.provenance.lookup("outer")).toEqual({ kind: "unavailable", reason: "record_missing" });
      return refused();
    });
    expect(f.provenance.lookup("outer")).toEqual({ kind: "unavailable", reason: "result_unproven" });
  });

  it.each([
    { label: "uncertain failure", result: { ...success(), failure: { stage: "execution", category: "ambiguous_or_unknown", effect: "ambiguous", code: "host.unknown", retryable: false } } },
    { label: "malformed failure", result: { ...success(), failure: { malformed: true } } },
    { label: "unknown result", result: { kind: "llm_evidence_tool_execution", evidence: { ok: "unknown" }, effectApplied: false } },
    { label: "person needed", result: { ...success(), personNeeded: true } },
    { label: "malformed person flag", result: { ...success(), personNeeded: "true" } },
    { label: "written", result: { ...success(), resultCode: "core.run_node.written", draft: { written: true } } },
    { label: "synthetic verify", result: success("core.replay.verified") },
    { label: "synthetic present", result: success("core.replay.present") },
    { label: "bare ok", result: { ok: true } }
  ])("leaves $label outer settlement unproven", async ({ result }) => {
    const f = fixture();
    await f.provenance.capture(f.request("outer"), async () => {
      f.publish(f.snapshot());
      return result as AutomationStudioLlmRerunResult;
    });
    expect(f.provenance.lookup("outer")).toEqual({ kind: "unavailable", reason: "result_unproven" });
  });

  it("preserves the original thrown error without sealing or publishing its text", async () => {
    const f = fixture();
    const error = new Error("private-host-error");
    await expect(f.provenance.capture(f.request("throws"), async () => {
      f.publish(f.snapshot());
      throw error;
    })).rejects.toBe(error);
    const found = f.provenance.lookup("throws");
    expect(found).toEqual({ kind: "unavailable", reason: "result_unproven" });
    expect(JSON.stringify(found)).not.toContain("private-host-error");
  });

  it.each(["failed_unacted", "uncertain", "unknown"] as const)("cannot seal a selected %s dispatch behind an outer ok", async (outcome) => {
    const f = fixture();
    await f.provenance.capture(f.request("dispatch"), async () => {
      expect(f.publish(f.snapshot({ dispatch: {
        attempts: [{ identity: f.attempt, receipt: f.receipt, outcome }], selected: f.attempt
      } }))).toEqual({ kind: "unavailable", reason: "dispatch_unproven" });
      return success();
    });
    expect(f.provenance.lookup("dispatch")).toEqual({ kind: "unavailable", reason: "dispatch_unproven" });
  });

  it.each(["foreign selected", "nonfinal selected", "missing success receipt", "earlier uncertainty"])("rejects %s dispatch linkage", async (variant) => {
    const f = fixture();
    const next = {};
    const attempts = variant === "missing success receipt"
      ? [{ identity: f.attempt, outcome: "succeeded" as const }]
      : variant === "earlier uncertainty"
        ? [{ identity: next, outcome: "unknown" as const }, { identity: f.attempt, receipt: f.receipt, outcome: "succeeded" as const }]
        : [{ identity: f.attempt, receipt: f.receipt, outcome: "succeeded" as const }, { identity: next, receipt: {}, outcome: "succeeded" as const }];
    await f.provenance.capture(f.request("dispatch"), async () => {
      f.publish(f.snapshot({ dispatch: { attempts, selected: variant === "foreign selected" ? {} : f.attempt } }));
      return success();
    });
    expect(f.provenance.lookup("dispatch")).toEqual({ kind: "unavailable", reason: "dispatch_unproven" });
  });

  it("retains the successful refreshed attempt without freezing producer-owned identities", async () => {
    const f = fixture();
    const first = {};
    const record = await f.seal("retry", async () => {
      f.publish(f.snapshot({ dispatch: { attempts: [
        { identity: first, outcome: "failed_unacted" },
        { identity: f.attempt, receipt: f.receipt, outcome: "succeeded" }
      ], selected: f.attempt } }));
      return success("warehouse.shelves.read");
    });
    expect(record.definitionId).toBe("warehouse.shelves");
    expect(Object.isFrozen(f.attempt)).toBe(false);
    expect(Object.isFrozen(f.receipt)).toBe(false);
  });

  it("requires explicit effective inputs, while an explicit empty map is proven", async () => {
    const f = fixture();
    const missing: Record<string, unknown> = { ...f.snapshot() };
    delete missing.effectiveInputs;
    await f.provenance.capture(f.request("missing"), async () => {
      expect(f.publish(missing as AutomationStudioLlmRerunCaptureSnapshot)).toEqual({ kind: "unavailable", reason: "effective_inputs_unproven" });
      return success();
    });
    expect(f.provenance.lookup("missing")).toEqual({ kind: "unavailable", reason: "effective_inputs_unproven" });
    const empty = await f.seal("empty", async () => {
      f.publish(f.snapshot({ effectiveInputs: {} }));
      return success();
    });
    expect(empty.effectiveInputs).toEqual({});
  });

  it.each([null, [], undefined, { input: undefined }])("rejects unreadable consumed-input provenance %#", async (effectiveInputs) => {
    const f = fixture();
    await f.provenance.capture(f.request("inputs"), async () => {
      f.publish({ ...f.snapshot(), effectiveInputs } as unknown as AutomationStudioLlmRerunCaptureSnapshot);
      return success();
    });
    expect(f.provenance.lookup("inputs")).toEqual({ kind: "unavailable", reason: "effective_inputs_unproven" });
  });

  it("never invokes a metadata accessor, and never substitutes an empty object", async () => {
    const f = fixture();
    const getter = vi.fn(() => { throw new Error("private-accessor-error"); });
    const snapshot = Object.defineProperty({ ...f.snapshot() }, "effectiveInputs", { get: getter, enumerable: true });
    await f.provenance.capture(f.request("accessor"), async () => {
      f.publish(snapshot);
      return success();
    });
    expect(getter).not.toHaveBeenCalled();
    expect(f.provenance.lookup("accessor")).toEqual({ kind: "unavailable", reason: "effective_inputs_unproven" });
  });

  it("deeply clones and freezes actual inputs, metadata, outer input and baseline", async () => {
    const f = fixture();
    const outer = success("warehouse.shelves.read");
    const record = await f.seal("immutable", async () => {
      f.publish(f.snapshot());
      return outer;
    });
    (f.parameters.columns as string[]).push("changed");
    (f.effectiveInputs.context as JsonObject).aisle = "changed";
    (f.value.parameters as JsonObject).target = "t2";
    outer.resultCode = "changed";
    expect(record.parameters).toEqual({ selector: "#private-shelf", columns: ["stock"] });
    expect(record.effectiveInputs).toEqual({ context: { aisle: "private-aisle" } });
    expect(record.originalValue).toEqual({ node: "shelves", parameters: { target: "t1" } });
    expect(record.resultCode).toBe("warehouse.shelves.read");
    expect((record.execution as { resultCode?: string }).resultCode).toBe("warehouse.shelves.read");
    expect(Object.isFrozen(record.parameters.columns)).toBe(true);
    expect(Object.isFrozen(record.effectiveInputs.context)).toBe(true);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(f.parameters)).toBe(false);
  });

  it("does not infer canonical identity from the model's near spelling", async () => {
    const f = fixture();
    const record = await f.seal();
    expect(record.originalValue.node).toBe("shelves");
    expect(record.definitionId).toBe("warehouse.shelves");
    expect(record.definitionVersion).toBe("1.0.0");
  });

  it("retains the exact immutable private subject identity without publishing it", async () => {
    const f = fixture();
    const record = await f.seal("first-subject");
    const distinctSubject = Object.freeze({ privateSubject: "private-semantic-subject" });
    const distinct = await f.seal("distinct-subject", async () => {
      f.publish(f.snapshot({ subject: distinctSubject }));
      return success();
    });
    expect(record.subject).toBe(f.subject);
    expect(distinct.subject).toBe(distinctSubject);
    expect(distinct.subject).toEqual(record.subject);
    expect(distinct.subject).not.toBe(record.subject);
    expect(Reflect.set(record, "subject", distinctSubject)).toBe(false);
    expect(record.subject).toBe(f.subject);
    expect(Object.getOwnPropertyDescriptor(record, "subject")).toMatchObject({
      value: f.subject, enumerable: false, writable: false, configurable: false
    });
    expect({ ...record }).toEqual({});
    expect(JSON.stringify(record)).toBe("{}");
    expect(JSON.stringify({ lookup: f.provenance.lookup("first-subject"), record, distinct })).not.toContain("private-semantic-subject");
  });

  it("refuses multiple provisional publications and reference-instant changes", async () => {
    const f = fixture();
    await f.provenance.capture(f.request("conflict"), async () => {
      f.publish(f.snapshot());
      expect(f.publish(f.snapshot())).toEqual({ kind: "unavailable", reason: "capture_conflict" });
      return success();
    });
    expect(f.provenance.lookup("conflict")).toEqual({ kind: "unavailable", reason: "capture_conflict" });
    await f.provenance.capture({ ...f.request("reference"), referenceNow: 1 }, async () => {
      f.publish(f.snapshot());
      return success();
    });
    expect(f.provenance.lookup("reference")).toEqual({ kind: "unavailable", reason: "reference_changed" });
  });

  it("cannot revive either concurrent capture that reused one actual call id", async () => {
    const f = fixture();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const first = f.provenance.capture(f.request("same"), async () => {
      f.publish(f.snapshot());
      await held;
      return success();
    });
    await f.provenance.capture(f.request("same"), async () => success());
    release();
    await first;
    expect(f.provenance.lookup("same")).toEqual({ kind: "unavailable", reason: "duplicate_call" });
  });
});

describe("Core-private frozen execution", () => {
  it("calls the same wrapped executor with original public input and fixed reference instant", async () => {
    const f = fixture();
    const wrapped = vi.fn(f.producer);
    const record = await f.seal("original", wrapped);
    (f.value.parameters as JsonObject).target = "new-handle";
    const outcome = await f.provenance.execute(record, { callId: "rerun" });
    expect(outcome.kind).toBe("returned");
    expect(wrapped).toHaveBeenCalledTimes(2);
    expect(f.requests[1]).toEqual({ callId: "rerun", toolId: "core.run_node", value: {
      node: "shelves", parameters: { target: "t1" }
    }, referenceNow: 123456 });
    expect(f.normal).toBe(1);
    expect(f.frozen).toBe(1);
    expect(JSON.stringify(f.requests[1])).not.toContain("#private-shelf");
  });

  it("matches actual adapter input after a deterministic outer transform", async () => {
    const f = fixture();
    let injected = "private-fixed-wrapper-value";
    const wrapped: AutomationStudioLlmRerunExecutor = (request) => f.producer({
      ...request, value: { ...request.value, injected }
    });
    const record = await f.seal("original", wrapped);
    expect(record.originalValue).not.toHaveProperty("injected");
    expect((await f.provenance.execute(record, { callId: "same-wrapper" })).kind).toBe("returned");
    injected = "private-changed-wrapper-value";
    const outcome = await f.provenance.execute(record, { callId: "changed-wrapper" });
    expect(outcome).toEqual({ kind: "unproven", reason: "adapter_input_changed" });
    expect(f.normal).toBe(1);
    expect(f.frozen).toBe(1);
    expect(JSON.stringify(outcome)).not.toContain("private-");
  });

  it.each(["owner", "generation", "node", "parameter"] as const)("refuses changed adapter %s without ordinary fallback", async (changed) => {
    const f = fixture();
    let rerunning = false;
    let fellThrough = 0;
    const wrapped: AutomationStudioLlmRerunExecutor = async (request) => {
      if (!rerunning) return f.producer(request);
      const value = changed === "node" ? { ...request.value, node: "other" }
        : changed === "parameter" ? { ...request.value, parameters: { target: "t2" } } : request.value;
      const access = automationStudioLlmRerunExecution({ owner: changed === "owner" ? {} : f.owner,
        generation: changed === "generation" ? {} : f.generation, value });
      expect(access.kind).toBe("refused");
      if (access.kind === "ordinary") fellThrough++;
      return refused();
    };
    const record = await f.seal("original", wrapped);
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "changed" });
    expect(outcome.kind).toBe("unproven");
    expect(fellThrough).toBe(0);
    expect(f.frozen).toBe(0);
  });

  it.each(["ignored", "copied", "twice"] as const)("cannot treat a %s capsule as frozen execution", async (mode) => {
    const f = fixture();
    let rerunning = false;
    const wrapped: AutomationStudioLlmRerunExecutor = async (request) => {
      if (!rerunning) return f.producer(request);
      await f.assess(request);
      const access = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      expect(access.kind).toBe("selected");
      if (access.kind === "selected" && mode !== "ignored") {
        access.consume(mode === "copied" ? structuredClone(access.capsule) : access.capsule);
        if (mode === "twice") expect(access.consume(access.capsule).kind).toBe("refused");
      }
      return success();
    };
    const record = await f.seal("original", wrapped);
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "rerun" });
    expect(outcome).toEqual({ kind: "unproven", reason: mode === "ignored" ? "capsule_unconsumed" : mode === "copied" ? "capsule_changed" : "capsule_consumed" });
    expect(f.provenance.lookup("original").kind).toBe("unavailable");
  });

  it("keeps actual returned receipts when an unconsumed call cannot be proven", async () => {
    const f = fixture();
    let rerunning = false;
    const actual = success("warehouse.shelves.read");
    const record = await f.seal("original", async (request) => rerunning ? actual : f.producer(request));
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "unconsumed" });
    expect(outcome.kind).toBe("unproven");
    if (outcome.kind === "unproven") expect(outcome.result).toBe(actual);
  });

  it("retains a consumed failure for ordinary C settlement rather than inventing success", async () => {
    const f = fixture();
    let rerunning = false;
    const actual = refused();
    const record = await f.seal("original", async (request) => {
      if (!rerunning) return f.producer(request);
      await f.assess(request);
      const access = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (access.kind === "selected") {
        access.consume(access.capsule);
        f.report(access, "failed_unacted");
      }
      return actual;
    });
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "failed" });
    expect(outcome.kind).toBe("unproven");
    expect(outcome.main).toBe("receipt");
    if (outcome.kind === "unproven") expect(outcome.result).toBe(actual);
  });

  it("preserves execution throws while revoking the now-unproven selection", async () => {
    const f = fixture();
    let rerunning = false;
    const error = new Error("private-executor-error");
    const record = await f.seal("original", async (request) => {
      if (!rerunning) return f.producer(request);
      await f.assess(request);
      const access = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (access.kind === "selected") {
        access.consume(access.capsule);
        f.report(access);
      }
      throw error;
    });
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "throws" });
    expect(outcome.kind).toBe("threw");
    expect(outcome.main).toBe("receipt");
    if (outcome.kind === "threw") expect(outcome.error).toBe(error);
    expect(outcome.dispatch?.attempts).toHaveLength(1);
    expect(f.provenance.lookup("original")).toEqual({ kind: "unavailable", reason: "result_unproven" });
    expect(JSON.stringify(f.provenance.lookup("original"))).not.toContain("private-executor-error");
  });

  it.each(["loop", "binding", "generation", "registry", "authority"] as const)("permanently revokes a changed %s identity", async (key) => {
    const f = fixture();
    const original = f.current!;
    const record = await f.seal();
    f.current = { ...original, [key]: {} };
    expect(f.provenance.lookup("original")).toEqual({ kind: "unavailable", reason: "scope_changed" });
    f.current = original;
    expect(await f.provenance.execute(record, { callId: "stale" })).toEqual({ kind: "unavailable", reason: "scope_changed" });
    expect(f.requests).toHaveLength(1);
  });

  it("uses a new registry identity to revoke old canonical definition versions", async () => {
    const f = fixture();
    const record = await f.seal();
    f.current = { ...f.current!, registry: {} };
    expect(record.definitionVersion).toBe("1.0.0");
    expect(await f.provenance.execute(record, { callId: "new-version" })).toEqual({ kind: "unavailable", reason: "scope_changed" });
  });

  it("reports an unreadable or absent authoritative scope without leaking its error", async () => {
    const p = createAutomationStudioLlmRerunProvenance({ currentScope: () => { throw new Error("private-scope-error"); } });
    const f = fixture();
    await p.capture(f.request("unreadable"), async () => success());
    expect(p.lookup("unreadable")).toEqual({ kind: "unavailable", reason: "scope_unreadable" });
    expect(JSON.stringify(p.lookup("unreadable"))).not.toContain("private-scope-error");
    f.current = undefined;
    await f.provenance.capture(f.request("absent"), async () => success());
    expect(f.provenance.lookup("absent")).toEqual({ kind: "unavailable", reason: "scope_unavailable" });
  });

  it("cannot select copied records, foreign registries or an old client's successful JSON", async () => {
    const f = fixture();
    const record = await f.seal();
    const other = createAutomationStudioLlmRerunProvenance({ currentScope: () => f.current });
    expect(await other.execute(record, { callId: "foreign" })).toEqual({ kind: "unavailable", reason: "foreign_record" });
    const copied = JSON.parse(JSON.stringify(record)) as AutomationStudioLlmRerunRecord;
    expect(await f.provenance.execute(copied, { callId: "copied" })).toEqual({ kind: "unavailable", reason: "foreign_record" });
    await other.capture(f.request("old-client"), async () => success());
    expect(other.lookup("old-client")).toEqual({ kind: "unavailable", reason: "capture_missing" });
  });

  it("disposes authority and cannot restore it in a restarted loop", async () => {
    const f = fixture();
    const record = await f.seal();
    f.provenance.dispose();
    expect(f.provenance.lookup("original")).toEqual({ kind: "unavailable", reason: "disposed" });
    expect(await f.provenance.execute(record, { callId: "after-dispose" })).toEqual({ kind: "unavailable", reason: "disposed" });
    const restarted = createAutomationStudioLlmRerunProvenance({ currentScope: () => scope() });
    expect(await restarted.execute(record, { callId: "restart" })).toEqual({ kind: "unavailable", reason: "foreign_record" });
  });
});

describe("host-local isolation and privacy", () => {
  it("isolates nested capture transactions, including a held outer sink", async () => {
    const f = fixture();
    await f.provenance.capture(f.request("outer"), async () => {
      const outer = automationStudioLlmRerunCapture();
      expect(outer.kind).toBe("capture");
      await f.provenance.capture(f.request("inner"), async () => {
        if (outer.kind === "capture") expect(outer.publish(f.snapshot())).toEqual({ kind: "unavailable", reason: "capture_closed" });
        f.publish(f.snapshot({ parameters: { shelf: "inner" } }));
        return success();
      });
      f.publish(f.snapshot({ parameters: { shelf: "outer" } }));
      return success();
    });
    const outer = f.provenance.lookup("outer");
    const inner = f.provenance.lookup("inner");
    expect(outer.kind).toBe("available");
    expect(inner.kind).toBe("available");
    if (outer.kind === "available" && inner.kind === "available") {
      expect(outer.record.parameters).toEqual({ shelf: "outer" });
      expect(inner.record.parameters).toEqual({ shelf: "inner" });
    }
  });

  it("isolates concurrent loops with the same textual call id", async () => {
    const a = fixture();
    const b = fixture();
    const [left, right] = await Promise.all([
      a.seal("same", async (request) => {
        await Promise.resolve();
        return a.producer(request);
      }),
      b.seal("same", async (request) => {
        await Promise.resolve();
        return b.producer(request);
      })
    ]);
    expect(await a.provenance.execute(right, { callId: "foreign" })).toEqual({ kind: "unavailable", reason: "foreign_record" });
    const results = await Promise.all([
      a.provenance.execute(left, { callId: "same-rerun" }),
      b.provenance.execute(right, { callId: "same-rerun" })
    ]);
    expect(results.map((result) => result.kind)).toEqual(["returned", "returned"]);
    expect(a.frozen).toBe(1);
    expect(b.frozen).toBe(1);
  });

  it("shares only the ambient channel across separately loaded Core copies", async () => {
    vi.resetModules();
    const copy = await import("../index.ts");
    expect(copy.automationStudioLlmRerunCapture).not.toBe(automationStudioLlmRerunCapture);
    const f = fixture();
    const wrapped: AutomationStudioLlmRerunExecutor = async (request) => {
      await f.assess(request);
      const access = copy.automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (access.kind === "selected") {
        expect(access.capsule).toBe(f.capsule);
        expect(access.consume(f.capsule)).toEqual({ kind: "consumed" });
        f.report(access);
      } else {
        expect(access.kind).toBe("ordinary");
        const sink = copy.automationStudioLlmRerunCapture();
        expect(sink.kind).toBe("capture");
        if (sink.kind === "capture") sink.publish(f.snapshot({ adapterValue: request.value }));
      }
      return success();
    };
    const record = await f.seal("cross-copy", wrapped);
    expect((await f.provenance.execute(record, { callId: "cross-copy-rerun" })).kind).toBe("returned");
    const foreign = copy.createAutomationStudioLlmRerunProvenance({ currentScope: () => f.current });
    expect(await foreign.execute(record, { callId: "other-copy-registry" })).toEqual({ kind: "unavailable", reason: "foreign_record" });
  });

  it("expires saved capture sinks and capsule consumers after their real call", async () => {
    const f = fixture();
    let heldCapture: AutomationStudioLlmRerunCaptureAccess = { kind: "unavailable", reason: "inactive" };
    let heldExecution: AutomationStudioLlmRerunExecutionAccess = { kind: "ordinary" };
    let rerunning = false;
    const record = await f.seal("expiry", async (request) => {
      if (!rerunning) {
        heldCapture = automationStudioLlmRerunCapture();
        return f.producer(request);
      }
      await f.assess(request);
      heldExecution = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      if (heldExecution.kind === "selected") {
        heldExecution.consume(heldExecution.capsule);
        f.report(heldExecution);
      }
      return success();
    });
    rerunning = true;
    await f.provenance.execute(record, { callId: "expiry-rerun" });
    expect((heldCapture as AutomationStudioLlmRerunCaptureAccess).kind).toBe("capture");
    const captured = heldCapture as AutomationStudioLlmRerunCaptureAccess;
    if (captured.kind === "capture") expect(captured.publish(f.snapshot())).toEqual({ kind: "unavailable", reason: "capture_closed" });
    const execution = heldExecution as AutomationStudioLlmRerunExecutionAccess;
    if (execution.kind === "selected") expect(execution.consume(execution.capsule)).toEqual({ kind: "refused", reason: "execution_closed" });
    expect(automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: f.value })).toEqual({ kind: "ordinary" });
  });

  it("does not serialize private records, capsule payloads, adapter inputs or raw results", async () => {
    const f = fixture();
    let selected = "";
    let rerunning = false;
    const wrapped: AutomationStudioLlmRerunExecutor = async (request) => {
      await f.assess(request);
      if (!rerunning) {
        f.publish(f.snapshot({ adapterValue: request.value }));
        return success();
      }
      const access = automationStudioLlmRerunExecution({ owner: f.owner, generation: f.generation, value: request.value });
      selected = JSON.stringify(access);
      if (access.kind === "selected") {
        access.consume(access.capsule);
        f.report(access);
      }
      return success();
    };
    const record = await f.seal("privacy", wrapped);
    rerunning = true;
    const outcome = await f.provenance.execute(record, { callId: "privacy-rerun" });
    expect(JSON.stringify({ lookup: f.provenance.lookup("privacy"), record, outcome, selected })).toBe(
      '{"lookup":{"kind":"available"},"record":{},"outcome":{"kind":"returned"},"selected":"{\\"kind\\":\\"selected\\"}"}'
    );
    expect(Object.keys(record)).toEqual([]);
    expect(Object.keys(outcome)).toEqual(["kind"]);
  });
});
