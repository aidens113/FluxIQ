// A person's question on this path has no clock: the ask is written with none and waited on with
// no deadline, however the gate asks, and only the signal it hands on (a Stop) ends the wait.
import { describe, expect, it } from "vitest";
import { automationStudioPermissionAskOutcome, type AutomationStudioParkingPort } from "../../../../../../runtime/automation-parking/index.ts";
import { automationStudioAnswerFirstUnboundedPort } from "../../person-waits/index.ts";
import { automationStudioAnswerFirstAnswerOnStop, automationStudioAnswerFirstHoldAnswer } from "../stop-answer.ts";

function port(answer: { kind: "grant" } | { kind: "deny" } | undefined) {
  const seen: { opened?: { timeoutMs: number | null | undefined; onTimeout: string | null | undefined }; wait?: { expiresAtMs?: number; signal?: AbortSignal } } = {};
  const inner: AutomationStudioParkingPort = {
    open: (ask) => { seen.opened = { timeoutMs: ask.timeoutMs, onTimeout: ask.onTimeout }; },
    awaitAnswer: async (_ask, wait) => {
      seen.wait = wait;
      return answer as Awaited<ReturnType<NonNullable<AutomationStudioParkingPort["awaitAnswer"]>>>;
    }
  };
  return { inner, seen };
}

const REQUEST = { requestId: "request.1", consequences: ["delete"], missing: ["delete"], control: { name: "Remove", kind: "button" }, sentence: "May I remove it?", reason: { stage: "authoring" }, action: { id: "tool" } } as unknown as Parameters<typeof automationStudioPermissionAskOutcome>[1];

describe("a question with no clock", () => {
  it("writes no timeout and waits on no deadline, whatever the caller asked, and hands on the Stop", async () => {
    const { inner, seen } = port({ kind: "grant" });
    const stop = new AbortController();
    const waits: Array<[string, number]> = [];
    let now = 100;
    const unbounded = automationStudioAnswerFirstUnboundedPort(inner, (state, ms) => {
      waits.push([state, ms]);
      now += 50;
    }, () => now);
    const outcome = await automationStudioPermissionAskOutcome({ port: unbounded, timeoutMs: 120_000, signal: stop.signal }, REQUEST);
    expect(outcome).toBe("granted");
    expect(seen.opened).toEqual({ timeoutMs: null, onTimeout: null });
    expect(seen.wait?.expiresAtMs).toBeUndefined();
    expect(seen.wait?.signal).toBe(stop.signal);
    expect(waits[0]).toEqual(["started", 0]);
    expect(waits[1]?.[0]).toBe("ended");
  });

  it("reads a no as a no", async () => {
    const { inner } = port({ kind: "deny" });
    const unbounded = automationStudioAnswerFirstUnboundedPort(inner, () => undefined);
    await expect(automationStudioPermissionAskOutcome({ port: unbounded, timeoutMs: 120_000 }, REQUEST)).resolves.toBe("declined");
  });
});

describe("a Stop's answer", () => {
  const abort = new DOMException("Build stopped.", "AbortError");

  it("is the answer held for this call, and only for an abort", () => {
    const request = {};
    const answer = { status: "answered" } as unknown as Parameters<typeof automationStudioAnswerFirstHoldAnswer>[1];
    automationStudioAnswerFirstHoldAnswer(request, answer);
    expect(automationStudioAnswerFirstAnswerOnStop(request, abort)).toBe(answer);
    const other = new Error("Something else.");
    expect(() => automationStudioAnswerFirstAnswerOnStop(request, other)).toThrow(other);
  });

  it("rethrows for a call whose attempt never ended", () => {
    expect(() => automationStudioAnswerFirstAnswerOnStop({}, abort)).toThrow(abort);
  });
});
