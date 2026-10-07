import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ClientGatewayCommandLedgerController as Controller, type ClientGatewayCommandClaim, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandRecord } from "../index.ts";

function claim(): ClientGatewayCommandClaim {
  const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "node.attempt.1", effectOrdinal: 0 };
  return { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Controller.commandId(owner), clientId: "client.1", sessionId: "session.1" }, requestDigest: `sha256:${"a".repeat(64)}` };
}
function receipt(input = claim()) {
  return { schemaVersion: "gateway_command_receipt.v1" as const, commandId: input.binding.commandId, requestDigest: input.requestDigest, clientId: input.binding.clientId, sessionId: input.binding.sessionId, status: "succeeded" as const, receivedAt: 100, resultDigest: `sha256:${"b".repeat(64)}`, redaction: "receipt_only" as const };
}
function port(): ClientGatewayCommandLedgerPort {
  let record: ClientGatewayCommandRecord | null = null;
  return {
    claim: vi.fn(async input => { const sendAllowed = record === null; record ??= { claim: input, claimedAt: 50, state: "pending", receipt: null, committedAt: null, unknownReason: null }; return { sendAllowed, record }; }),
    commitReceipt: vi.fn(async (input, result) => record = { claim: input, claimedAt: 50, state: "committed", receipt: result, committedAt: 101, unknownReason: null }),
    markUnknown: vi.fn(async (input, reason) => record = { claim: input, claimedAt: 50, state: "unknown", receipt: null, committedAt: null, unknownReason: reason }),
    read: vi.fn(async () => record)
  };
}
describe("durable gateway command controller infrastructure", () => {
  it("awaits claim before send and receipt commit before live completion", async () => {
    const ledger = port(), stages: string[] = [], input = claim();
    const originalClaim = ledger.claim, originalCommit = ledger.commitReceipt;
    ledger.claim = async value => { stages.push("claim"); return originalClaim(value); };
    ledger.commitReceipt = async (value, ack) => { stages.push("commit"); return originalCommit(value, ack); };
    const result = await new Controller(ledger).dispatch(input, async () => { stages.push("send"); return { result: { privateValue: "live-only" }, receipt: receipt(input) }; });
    expect(stages).toEqual(["claim", "send", "commit"]);
    expect(result).toMatchObject({ status: "completed", result: { privateValue: "live-only" } });
    expect(JSON.stringify(await ledger.read(input))).not.toContain("live-only");
  });
  it("never sends an existing pending/committed claim and never invents restored payload", async () => {
    const ledger = port(), controller = new Controller(ledger), send = vi.fn(async () => ({ result: "live", receipt: receipt() }));
    await ledger.claim(claim());
    expect(await controller.dispatch(claim(), send)).toEqual({ status: "outcome_unknown" }); expect(send).not.toHaveBeenCalled();
    await ledger.commitReceipt(claim(), receipt());
    expect(await controller.dispatch(claim(), send)).toEqual({ status: "result_unavailable", receipt: receipt() }); expect(send).not.toHaveBeenCalled();
  });
  it("does not send after claim failure or cancellation during claim", async () => {
    const ledger = port(), send = vi.fn(), abort = new AbortController();
    ledger.claim = async () => { throw new Error("claim failed"); };
    await expect(new Controller(ledger).dispatch(claim(), send)).rejects.toThrow("claim failed"); expect(send).not.toHaveBeenCalled();
    const second = port(), original = second.claim;
    second.claim = async input => { const record = await original(input); abort.abort(); return record; };
    expect(await new Controller(second).dispatch(claim(), send, abort.signal)).toEqual({ status: "outcome_unknown" }); expect(send).not.toHaveBeenCalled();
  });
  it("uncertain send leaves unknown and blocks later retry", async () => {
    const ledger = port(), send = vi.fn(async () => { throw new Error("possibly delivered"); }), controller = new Controller(ledger);
    expect(await controller.dispatch(claim(), send)).toEqual({ status: "outcome_unknown" });
    expect(await controller.dispatch(claim(), send)).toEqual({ status: "outcome_unknown" }); expect(send).toHaveBeenCalledTimes(1);
  });
  it("reconciles lost receipt commit acknowledgement before returning actual live result", async () => {
    const ledger = port(), original = ledger.commitReceipt;
    ledger.commitReceipt = async (input, ack) => { await original(input, ack); throw new Error("lost commit ack"); };
    expect(await new Controller(ledger).dispatch(claim(), async () => ({ result: "live", receipt: receipt() }))).toMatchObject({ status: "completed", result: "live" });
  });
  it("refuses forged receipt binding and extra raw fields", () => {
    expect(() => Controller.validateReceipt(claim(), { ...receipt(), sessionId: "wrong" })).toThrow();
    expect(() => Controller.validateReceipt(claim(), { ...receipt(), payload: "private" } as never)).toThrow();
    expect(() => Controller.validateClaim({ ...claim(), binding: { ...claim().binding, commandId: "model.command" } })).toThrow();
    expect(Controller.commandId({ ...claim().binding, effectOrdinal: 1 })).not.toEqual(claim().binding.commandId);
  });
  it("hashes complete payload arrays in semantic order and sorts keys by Unicode code point", () => {
    const original = { parameters: { list: [1, { typed: "two" }, null, true] }, actionType: "web.action" };
    const canonical = '{"actionType":"web.action","parameters":{"list":[1,{"typed":"two"},null,true]}}';
    expect(Controller.digest(original)).toBe(`sha256:${createHash("sha256").update(canonical).digest("hex")}`);
    expect(Controller.digest({ parameters: original.parameters, actionType: original.actionType })).toBe(Controller.digest(original));
    expect(Controller.digest([1, 2])).not.toBe(Controller.digest([2, 1]));
    expect(Controller.digest({ "😀": 1, "\ufffd": 2 })).toBe(`sha256:${createHash("sha256").update('{"\ufffd":2,"😀":1}').digest("hex")}`);
  });
  it("rejects nonplain objects, undefined, nonfinite, sparse arrays and non-JSON fields", () => {
    const sparse = new Array(2); sparse[1] = 1;
    const extra = [1]; Reflect.set(extra, "rawExtra", "must-not-ignore");
    const symbolic = { safe: 1 }; Reflect.set(symbolic, Symbol("extra"), 2);
    for (const input of [new Date(), new Map(), new (class Example { x = 1; })(), undefined, { field: undefined }, [undefined], NaN, Infinity, { n: -Infinity }, sparse, extra, symbolic]) expect(() => Controller.digest(input)).toThrow();
  });
  it("bounds hashing by UTF8 bytes, depth and node count and refuses cycles", () => {
    expect(() => Controller.digest("a".repeat(256 * 1024 - 2))).not.toThrow();
    expect(() => Controller.digest("a".repeat(256 * 1024 - 1))).toThrow();
    expect(() => Controller.digest("😀".repeat(70_000))).toThrow();
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    expect(() => Controller.digest(cycle)).toThrow();
    let deep: unknown = null; for (let i = 0; i < 65; i++) deep = { child: deep };
    expect(() => Controller.digest(deep)).toThrow();
    // Below the byte limit: failure must come from the independent node-count bound.
    expect(() => Controller.digest(new Array(65_536).fill(0))).toThrow("hash_structure_limit");
  });
  it("freezes the validated claim before a real port callback can mutate its nested binding", async () => {
    const ledger = port(), input = claim(), original = ledger.claim;
    ledger.claim = async value => {
      expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.binding)).toBe(true);
      expect(() => { value.binding.sessionId = "mutated.session"; }).toThrow();
      return original(value);
    };
    expect(await new Controller(ledger).dispatch(input, async () => ({ result: "live", receipt: receipt(input) }))).toMatchObject({ status: "completed" });
    expect(input.binding.sessionId).toBe("session.1");
  });
  it("copies and freezes callback receipt before await so original answer mutation cannot alter commit or success", async () => {
    const ledger = port(), input = claim(), ack = receipt(input), original = ledger.commitReceipt;
    ledger.commitReceipt = async (value, supplied) => {
      expect(supplied).not.toBe(ack); expect(Object.isFrozen(supplied)).toBe(true);
      expect(() => { supplied.sessionId = "port.mutated"; }).toThrow();
      ack.resultDigest = `sha256:${"c".repeat(64)}`; ack.sessionId = "answer.mutated";
      await Promise.resolve();
      return original(value, supplied);
    };
    expect(await new Controller(ledger).dispatch(input, async () => ({ result: { opaque: true }, receipt: ack }))).toMatchObject({ status: "completed", receipt: { sessionId: "session.1", resultDigest: `sha256:${"b".repeat(64)}` } });
  });
});
