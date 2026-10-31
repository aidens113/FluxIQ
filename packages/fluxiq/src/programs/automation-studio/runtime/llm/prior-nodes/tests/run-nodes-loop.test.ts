import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../evidence-loop.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../build-purse/index.ts";
import * as provenance from "../../rerun-provenance/index.ts";
import * as coordinator from "../../node-reruns/index.ts";
import { batchCall, complete, observeMemberOutcomes, priorNodesFixture, readCall } from "./fixtures.ts";

function summary(decide: ReturnType<typeof vi.fn>, index = 3) {
  const request = decide.mock.calls[index]?.[0] as Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0] | undefined;
  return request?.evidence.find((entry) => entry.callId === "batch")?.value;
}

const unsafeOriginals: Array<{ label: string; input(value: JsonObject): JsonObject }> = [
  ...["create_new", "modify_existing", "delete", "move_money", "send_or_publish"].map((consequence) => ({ label: `declared ${consequence}`, input: (value: JsonObject) => ({ ...value, consequences: [consequence] }) })),
  { label: "missing declaration", input: ({ consequences: _declaration, ...value }) => value },
  { label: "null declaration", input: (value) => ({ ...value, consequences: null }) },
  { label: "non-array declaration", input: (value) => ({ ...value, consequences: "none" }) },
  { label: "unreadable declaration object", input: (value) => ({ ...value, consequences: { safe: true } }) },
  { label: "nested-only declaration", input: ({ consequences: _declaration, ...value }) => ({ ...value, parameters: { item: "one", extraction: "visible-handle", consequences: ["delete"] } }) },
  ...["write", "replay", "undoes", "reset", "resetDestination", "add", "permission"].map((key) => ({ label: `execution control ${key}`, input: (value: JsonObject) => ({ ...value, [key]: true }) }))
];

describe("prior successful calls in the actual evidence loop", () => {
  describe.each(["observe", "state"] as const)("a sealed %s original still requires its actual empty declaration", (effect) => {
    it.each(unsafeOriginals)("refuses $label without losing its original receipt", async (variant) => {
      const create = provenance.createAutomationStudioLlmRerunProvenance;
      let registry: ReturnType<typeof create> | undefined;
      const observed = vi.spyOn(provenance, "createAutomationStudioLlmRerunProvenance").mockImplementation((input) => {
        registry = create(input);
        return registry;
      });
      const f = priorNodesFixture({ effect });
      const original = readCall("unsafe");
      const decide = vi.fn(async (request: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]) => {
        if (request.iteration === 1) return { ...original, input: variant.input(original.input) };
        if (request.iteration === 2) {
          expect(registry?.lookup("unsafe").kind).toBe("available");
          expect(request.tools.some((tool) => tool.toolId === "core.run_nodes")).toBe(false);
          return batchCall(["unsafe"]);
        }
        return complete;
      });
      try {
        const ended = await f.run([], { decide }).result;
        expect(ended).toMatchObject({ ok: true, accounting: { toolCalls: 1, iterations: 3 } });
        expect(ended.steps).toHaveLength(1);
        expect(ended.trace.some((row) => row.callId === "unsafe" && row.resultCode === "catalogue.read.done")).toBe(true);
        expect(summary(decide, 2)).toMatchObject({ status: "rejected", executed: 0, skipped: 1 });
        expect(f.actualItems).toEqual(["one"]);
        expect(f.publicRequests).toHaveLength(1);
        expect(JSON.stringify(decide.mock.calls)).not.toMatch(/private-resolved-query|authorityKey|capsule|effectiveInputs/);
      } finally { observed.mockRestore(); }
    });
  });

  it("offers only sealed calls, runs an ordered list through the original wrapper, and preserves private arguments", async () => {
    const f = priorNodesFixture();
    const usage = { inputTokens: 5, outputTokens: 3, totalTokens: 8, estimatedCostUsd: 0.001 };
    const { result, decide } = f.run([readCall("a"), readCall("b", "two"), { ...batchCall(["b", "a"]), usage }, complete]);
    const ended = await result;
    expect(ended).toMatchObject({ ok: true, accounting: { iterations: 4, toolCalls: 4, totalTokens: 8, estimatedCostUsd: 0.001 } });
    expect(f.actualItems).toEqual(["one", "two", "two", "one"]);
    expect(summary(decide)).toEqual({ status: "completed", requested: 2, executed: 2, skipped: 0 });
    const requests = decide.mock.calls.map((args) => args[0] as Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]);
    expect(requests[0]?.tools.some((tool) => tool.toolId === "core.run_nodes")).toBe(false);
    expect(requests[1]?.tools.find((tool) => tool.toolId === "core.run_nodes")?.inputSchema).toEqual(requests[2]?.tools.find((tool) => tool.toolId === "core.run_nodes")?.inputSchema);
    expect(requests[1]?.evidence.at(-1)).toMatchObject({ toolId: "core.run_nodes", value: { calls: ["a"] } });
    expect(requests[2]?.evidence.at(-1)).toMatchObject({ toolId: "core.run_nodes", value: { calls: ["a", "b"] } });
    expect(JSON.stringify(requests)).not.toMatch(/private-resolved-query|effectiveInputs|capsule|authorityKey|referenceNow/);
    expect(JSON.stringify(f.publicRequests)).not.toContain("private-resolved-query");
    expect(f.publicRequests.slice(2)).toEqual([f.publicRequests[1], f.publicRequests[0]]);
    if (ended.ok) expect(ended.steps).toHaveLength(2);
    expect(ended.trace.filter((row) => row.toolId === "core.run_node").map((row) => row.callId)).toEqual(["a", "b", "batch.member.1", "batch.member.2"]);
  });

  it.each(["missing_capture", "outer_refusal", "no_authority"])("never offers raw successful JSON for %s", async (reason) => {
    const f = priorNodesFixture({ capture: reason !== "missing_capture", outerRefusal: reason === "outer_refusal" });
    const { result, decide } = f.run([readCall("a"), complete], reason === "no_authority" ? { rerunAuthority: undefined } : {});
    await result;
    const request = decide.mock.calls[1]?.[0] as Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0];
    expect(request.tools.some((tool) => tool.toolId === "core.run_nodes")).toBe(false);
  });

  it("admits an actual explicitly repeat-safe state floor with fresh receipt proof", async () => {
    const f = priorNodesFixture({ effect: "state" });
    const { result, decide } = f.run([readCall("a"), batchCall(["a"]), complete]);
    const ended = await result;
    expect(ended).toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
    expect(summary(decide, 2)).toEqual({ status: "completed", requested: 1, executed: 1, skipped: 0 });
    expect(f.actualItems).toEqual(["one", "one"]);
    expect(ended.steps).toHaveLength(1);
  });

  it.each(["missing", "commit", "lasting_state"] as const)("refuses %s actual safety proof under a safe canonical registry floor", async (actual) => {
    const f = priorNodesFixture(actual === "missing" ? { assess: false } : { observedEffect: actual === "commit"
      ? { effectClass: "commit", permissionConsequences: ["modify_existing"] }
      : { effectClass: "state", permissionConsequences: ["create_new"] } });
    expect(f.port.resolve("catalogue.read", {}, {})?.effect.effectClass).toBe("observe");
    const { result, decide } = f.run([readCall("a"), batchCall(["a"]), complete]);
    const ended = await result;
    expect(ended).toMatchObject({ ok: true, accounting: { toolCalls: 1 } });
    expect(ended.steps).toHaveLength(1);
    expect(decide.mock.calls[1]?.[0].tools.some((tool) => tool.toolId === "core.run_nodes")).toBe(false);
    expect(summary(decide, 2)).toMatchObject({ status: "rejected", executed: 0 });
    expect(f.actualItems).toEqual(["one"]);
    expect(JSON.stringify(decide.mock.calls)).not.toMatch(/private-resolved-query|authorityKey|capsule|effectiveInputs/);
  });

  it("vetoes a newly lasting main before an ask/dispatch, retaining a real auxiliary read with no main charge", async () => {
    const observed = observeMemberOutcomes();
    const f = priorNodesFixture({ memberEffect: { effectClass: "commit", permissionConsequences: ["delete"] }, auxiliaryBeforeMember: true, permittedConsequences: [] });
    try {
      const { result, decide } = f.run([readCall("a"), readCall("b", "two"), batchCall(["a", "b"]), complete]);
      const ended = await result;
      expect(ended).toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
      expect(summary(decide)).toMatchObject({ status: "stopped", executed: 0, skipped: 2 });
      expect(f.actualItems).toEqual(["one", "two"]);
      expect(f.auxiliaryReads).toEqual(["guard-read"]);
      expect(f.authority.request).toBeUndefined();
      expect(observed.outcomes[0]).toMatchObject({ main: "unacted" });
      const request = decide.mock.calls[3]?.[0];
      expect(request?.evidence.find((entry) => entry.callId === "batch.member.1")?.value).toMatchObject({ ok: false, code: "catalogue.permission.held", auxiliary: ["guard-read"] });
      expect(ended.trace.filter((row) => row.callId === "batch.member.1" && row.decision === "tool_call")).toEqual([]);
      expect(ended.steps).toHaveLength(2);
    } finally { observed.restore(); }
  });

  it("refuses missing fresh PRIMARY proof before capsule authorization without counting the held main", async () => {
    const observed = observeMemberOutcomes();
    const f = priorNodesFixture({ memberAssess: false, auxiliaryBeforeMember: true });
    try {
      const { result, decide } = f.run([readCall("a"), batchCall(["a"]), complete]);
      const ended = await result;
      expect(ended.accounting.toolCalls).toBe(1);
      expect(summary(decide, 2)).toMatchObject({ status: "stopped", executed: 0, skipped: 1 });
      expect(f.actualItems).toEqual(["one"]);
      expect(f.auxiliaryReads).toEqual(["guard-read"]);
      expect(observed.outcomes[0]).toMatchObject({ main: "unacted" });
    } finally { observed.restore(); }
  });

  it.each([false, true])("keeps consumed-without-report main unknown, even when actual operation skipped=%s", async (skipMain) => {
    const observed = observeMemberOutcomes();
    const f = priorNodesFixture({ report: false, skipMain });
    try {
      const { result, decide } = f.run([readCall("a"), batchCall(["a"]), complete]);
      const ended = await result;
      expect(ended.accounting.toolCalls).toBe(2);
      expect(summary(decide, 2)).toMatchObject({ status: "stopped", executed: 0, unproven: 1, skipped: 0 });
      expect(f.actualItems).toHaveLength(skipMain ? 1 : 2);
      expect(observed.outcomes[0]).toMatchObject({ main: "unproven" });
      expect(ended.trace.some((row) => row.callId === "batch.member.1" && row.decision === "tool_call")).toBe(false);
      expect(ended.steps).toHaveLength(1);
    } finally { observed.restore(); }
  });

  it.each(["failed_unacted", "uncertain"] as const)("counts a fresh %s receipt once and stops before another member", async (dispatchOutcome) => {
    const observed = observeMemberOutcomes();
    const f = priorNodesFixture({ dispatchOutcome, memberResult(_index, normal) { return { ...normal, evidence: { ok: false, code: "catalogue.dispatch.failed" } }; } });
    try {
      const { result, decide } = f.run([readCall("a"), readCall("b", "two"), batchCall(["a", "b"]), complete], { toolFailures: "observe" });
      const ended = await result;
      expect(ended.accounting.toolCalls).toBe(3);
      expect(summary(decide)).toMatchObject({ status: "stopped", executed: 1, skipped: 1 });
      expect(f.actualItems).toEqual(["one", "two", "one"]);
      expect(observed.outcomes[0]).toMatchObject({ main: "receipt", dispatch: { attempts: [{ outcome: dispatchOutcome }] } });
      expect(JSON.stringify(decide.mock.calls)).not.toMatch(/private-producer-receipt|private-resolved-query/);
    } finally { observed.restore(); }
  });

  it.each(["veto", "throw"] as const)("keeps the fresh main receipt when a later %s stops settlement", async (stop) => {
    const observed = observeMemberOutcomes();
    const run = coordinator.runAutomationStudioLlmPriorNodes;
    const batches: Array<Awaited<ReturnType<typeof run>>> = [];
    const observedBatch = vi.spyOn(coordinator, "runAutomationStudioLlmPriorNodes").mockImplementation(async (input) => {
      const result = await run(input);
      batches.push(result);
      return result;
    });
    const f = priorNodesFixture(stop === "veto" ? { afterReceiptEffect: { effectClass: "commit", permissionConsequences: ["delete"] }, permittedConsequences: [] }
      : { memberResult() { throw new Error("private-after-receipt-error"); } });
    try {
      const { result, decide } = f.run([readCall("a"), batchCall(["a"]), complete], { toolFailures: "observe" });
      const ended = await result;
      expect(ended.accounting.toolCalls).toBe(2);
      expect(summary(decide, 2)).toMatchObject({ status: "stopped", executed: 1, skipped: 0 });
      expect(observed.outcomes[0]).toMatchObject({ main: "receipt", dispatch: { attempts: [{ receipt: { privateReceipt: "private-producer-receipt" } }] } });
      expect(observed.outcomes[0]?.kind).toBe(stop === "throw" ? "threw" : "unproven");
      expect(batches[0]?.executed[0]).toMatchObject({ kind: "threw", error: { cause: { main: "receipt", dispatch: { attempts: [{ receipt: { privateReceipt: "private-producer-receipt" } }] } } } });
      expect(f.authority.request).toBeUndefined();
      expect(JSON.stringify(decide.mock.calls)).not.toMatch(/private-after-receipt-error|private-producer-receipt|private-resolved-query/);
      expect(ended.steps).toHaveLength(1);
    } finally {
      observedBatch.mockRestore();
      observed.restore();
    }
  });

  it("keys ordered lists on canonical dispatch identity rather than aliases or model callIds", async () => {
    const f = priorNodesFixture();
    const { result, decide } = f.run([readCall("a", "one", "catalogue-read"), readCall("alias", "one", "CATALOGUE.READ"), batchCall(["a"]), batchCall(["alias"], "again"), complete]);
    await result;
    expect(f.actualItems).toEqual(["one", "one", "one"]);
    const request = decide.mock.calls[4]?.[0] as Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0];
    expect(request.evidence.find((entry) => entry.callId === "again")?.value).toMatchObject({ status: "rejected", executed: 0, reason: "list_guard_refused" });
  });

  it.each(["node", "binding", "effect", "tool"])("rechecks current %s authority before a member", async (changed) => {
    const f = priorNodesFixture();
    const decide = vi.fn(async (request: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]) => {
      if (request.iteration === 1) return readCall("a");
      if (request.iteration === 2) {
        if (changed === "node") f.tools[0]!.inputSchema.properties = { node: { enum: ["other.node"] } };
        if (changed === "binding") f.replaceBinding();
        if (changed === "effect") f.commitEffect();
        if (changed === "tool") f.tools[0]!.toolId = "withdrawn.tool";
        return batchCall(["a"]);
      }
      return complete;
    });
    await f.run([], { decide }).result;
    expect(f.actualItems).toEqual(["one"]);
    expect(summary(decide, 2)).toMatchObject({ executed: 0 });
  });

  it.each(["failed", "code_changed", "uncertain", "person_needed", "throws"] as const)("stops after %s and keeps the earlier actual receipts", async (reason) => {
    const f = priorNodesFixture({ memberResult(index, normal) {
      if (index !== 2) return normal;
      if (reason === "throws") throw new Error("private-host-error");
      if (reason === "failed") return { ...normal, evidence: { ok: false, code: "read.failed" } };
      if (reason === "code_changed") return { ...normal, resultCode: "read.changed" };
      if (reason === "person_needed") return { ...normal, personNeeded: true };
      return { ...normal, failure: { stage: "execution", category: "ambiguous_or_unknown", effect: "ambiguous", code: "read.unknown", retryable: false } };
    } });
    const recoverStall = vi.fn(() => ({ call: { toolId: "core.run_node", input: {} } }));
    const { result, decide } = f.run([readCall("a"), readCall("b", "two"), readCall("c", "three"), batchCall(["a", "b", "c"]), complete], { toolFailures: "observe", recoverStall });
    const ended = await result;
    expect(f.actualItems).toEqual(["one", "two", "three", "one", "two"]);
    expect(ended.accounting.toolCalls).toBe(5);
    expect(summary(decide, 4)).toMatchObject({ status: "stopped", executed: 2, skipped: 1, stoppedAt: 1 });
    expect(recoverStall).not.toHaveBeenCalled();
    expect(JSON.stringify(decide.mock.calls)).not.toContain("private-host-error");
    expect(ended.trace.some((row) => row.callId === "batch.member.1")).toBe(true);
    if (ended.ok) expect(ended.steps).toHaveLength(3);
  });

  it.each(["quota", "cancel", "time", "purse"])("executes no later member after %s is spent", async (bound) => {
    let now = 0;
    const abort = new AbortController();
    let spent = 0;
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, spentUsd: () => spent });
    const f = priorNodesFixture({ before(_call, member) {
      if (!member) return;
      if (bound === "cancel") abort.abort();
      if (bound === "time") now = 100_000;
      if (bound === "purse") spent = 1;
    } });
    const { result } = f.run([readCall("a"), readCall("b", "two"), batchCall(["a", "b"]), complete], {
      signal: abort.signal, ...(bound === "quota" ? { maxToolCalls: 3 } : {}), ...(bound === "time" ? { budget: { maxDurationMs: 100_000, now: () => now } } : {}), ...(bound === "purse" ? { purse } : {})
    });
    await result;
    expect(f.actualItems).toEqual(["one", "two", "one"]);
  });

  it("does not batch during candidate wrap-up or after a deadline crossed by the provider decision", async () => {
    const f = priorNodesFixture();
    let now = 0;
    const decide = vi.fn(async (request: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]) => {
      if (request.iteration === 1) return readCall("a");
      if (request.iteration === 2) {
        now = 10_000;
        return batchCall(["a"]);
      }
      return complete;
    });
    await f.run([], { decide, discoveryOnly: true, budget: { maxDurationMs: 10_000, now: () => now } }).result;
    expect(f.actualItems).toEqual(["one"]);
  });

  it("withholds the batch when only candidate finishing remains", async () => {
    const f = priorNodesFixture();
    const { result, decide } = f.run([readCall("a"), readCall("b", "two"), batchCall(["a", "b"]), complete], { discoveryOnly: true, maxIterations: 7, budget: { maxTotalTokens: 1_000, maxTokensPerDecision: 10 } });
    await result;
    const request = decide.mock.calls[2]?.[0];
    expect(request?.tools.some((tool) => tool.toolId === "core.run_nodes")).toBe(false);
    expect(f.actualItems).toEqual(["one", "two"]);
  });

  it("does not recover, replay or add steps when a member reaches the look guard", async () => {
    const f = priorNodesFixture();
    const recoverStall = vi.fn(() => ({ call: { toolId: "core.run_node", input: {} } }));
    const originals = Array.from({ length: 7 }, (_, i) => readCall(`a${i}`, `item${i}`));
    const { result } = f.run([...originals, batchCall(["a0", "a1"]), complete], { recoverStall });
    const ended = await result;
    expect(ended).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress", accounting: { toolCalls: 8 } });
    expect(recoverStall).not.toHaveBeenCalled();
    expect(ended.steps).toHaveLength(7);
    expect(f.actualItems).toHaveLength(8);
  });

  it("keeps the failed member's trace/accounting under the ordinary end-on-failure policy", async () => {
    const f = priorNodesFixture({ memberResult() { throw new Error("private-executor-error"); } });
    const { result } = f.run([readCall("a"), batchCall(["a"]), complete]);
    const ended = await result;
    expect(ended).toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed", accounting: { toolCalls: 2, iterations: 2 } });
    expect(ended.trace.some((row) => row.callId === "batch.member.1" && row.resultCode === "llm_evidence_loop.tool_failed")).toBe(true);
    expect(ended.steps).toHaveLength(1);
  });

  it("never reconstructs a previous loop's authority from saved callIds", async () => {
    const f = priorNodesFixture();
    await f.run([readCall("old"), complete]).result;
    const next = f.run([batchCall(["old"]), complete]);
    await next.result;
    expect(f.actualItems).toEqual(["one"]);
    expect(next.decide.mock.calls[0]?.[0].tools.some((tool) => tool.toolId === "core.run_nodes")).toBe(false);
  });
});
