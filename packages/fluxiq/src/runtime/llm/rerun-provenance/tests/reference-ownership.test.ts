import { describe, expect, it, vi } from "vitest";
import { automationStudioLlmRerunCapture, createAutomationStudioLlmRerunProvenance, type AutomationStudioLlmRerunRequest } from "../index.ts";
import { fixture, success } from "./fixtures.ts";

describe("the original host's fixed reference instant", () => {
  it("owns a missing reference before the whole executor and reuses it without reading the clock again", async () => {
    const now = vi.fn(() => 1700000000123);
    const f = fixture(now);
    const controller = new AbortController();
    const original = { ...f.request("original"), signal: controller.signal };
    const wrapped = vi.fn(f.producer);
    await f.provenance.capture(original, wrapped);
    const found = f.provenance.lookup("original");
    expect(found.kind).toBe("available");
    if (found.kind !== "available") throw new Error("test original reference did not seal");
    expect(wrapped.mock.calls[0]?.[0]).toMatchObject({ referenceNow: 1700000000123, callId: "original", toolId: "core.run_node" });
    expect(wrapped.mock.calls[0]?.[0].value).toBe(original.value);
    expect(wrapped.mock.calls[0]?.[0].signal).toBe(controller.signal);
    expect(original).not.toHaveProperty("referenceNow");
    expect(found.record.referenceNow).toBe(1700000000123);
    now.mockReturnValue(1800000000456);
    expect((await f.provenance.execute(found.record, { callId: "selected", signal: controller.signal })).kind).toBe("returned");
    expect(wrapped.mock.calls[1]?.[0].referenceNow).toBe(1700000000123);
    expect(wrapped.mock.calls[1]?.[0].signal).toBe(controller.signal);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it("preserves an explicit reference and the original request without consulting the host clock", async () => {
    const now = vi.fn(() => { throw new Error("explicit reference must not need a new clock"); });
    const f = fixture(now);
    const original = { ...f.request("explicit"), referenceNow: 0 };
    const wrapped = vi.fn(f.producer);
    await f.provenance.capture(original, wrapped);
    const found = f.provenance.lookup("explicit");
    expect(found.kind).toBe("available");
    if (found.kind !== "available") throw new Error("test explicit reference did not seal");
    expect(wrapped.mock.calls[0]?.[0]).toBe(original);
    expect(found.record.referenceNow).toBe(0);
    expect((await f.provenance.execute(found.record, { callId: "explicit-selected" })).kind).toBe("returned");
    expect(f.requests.map((request) => request.referenceNow)).toEqual([0, 0]);
    expect(now).not.toHaveBeenCalled();
  });

  it.each(["missing", "explicit"])("rejects a %s reference changed by an outer wrapper before publication", async (mode) => {
    const f = fixture(() => 2000);
    const request = mode === "explicit" ? { ...f.request("changed"), referenceNow: 2000 } : f.request("changed");
    const actual = success();
    const result = await f.provenance.capture(request, async (forwarded) => {
      expect(forwarded.referenceNow).toBe(2000);
      forwarded.referenceNow = 2001;
      expect(f.publish(f.snapshot({ referenceNow: forwarded.referenceNow }))).toEqual({ kind: "unavailable", reason: "reference_changed" });
      return actual;
    });
    expect(result).toBe(actual);
    expect(f.provenance.lookup("changed")).toEqual({ kind: "unavailable", reason: "reference_changed" });
  });

  it("rejects a producer-selected instant when the original request did not supply one", async () => {
    const f = fixture(() => 3000);
    await f.provenance.capture(f.request("changed"), async (forwarded) => {
      expect(forwarded.referenceNow).toBe(3000);
      expect(f.publish(f.snapshot({ referenceNow: 3001 }))).toEqual({ kind: "unavailable", reason: "reference_changed" });
      return success();
    });
    expect(f.provenance.lookup("changed")).toEqual({ kind: "unavailable", reason: "reference_changed" });
  });

  it("keeps an unavailable scope on its unchanged ordinary path", async () => {
    const now = vi.fn(() => 4000);
    const f = fixture(now);
    f.current = undefined;
    const original = f.request("unavailable");
    const wrapped = vi.fn(async (_request: AutomationStudioLlmRerunRequest) => success());
    await f.provenance.capture(original, wrapped);
    expect(wrapped).toHaveBeenCalledWith(original);
    expect(wrapped.mock.calls[0]?.[0]).toBe(original);
    expect(original).not.toHaveProperty("referenceNow");
    expect(now).not.toHaveBeenCalled();
    expect(f.provenance.lookup("unavailable")).toEqual({ kind: "unavailable", reason: "scope_unavailable" });
  });

  it.each([NaN, Infinity, -1, "throws"] as const)("keeps an unusable clock ordinary without capture eligibility %#", async (value) => {
    const f = fixture(() => {
      if (value === "throws") throw new Error("private-clock-error");
      return value;
    });
    const original = f.request("clock-unavailable");
    const actual = success();
    const result = await f.provenance.capture(original, async (request) => {
      expect(request).toBe(original);
      expect(automationStudioLlmRerunCapture()).toEqual({ kind: "unavailable", reason: "invalid_snapshot" });
      return actual;
    });
    expect(result).toBe(actual);
    expect(original).not.toHaveProperty("referenceNow");
    expect(f.provenance.lookup("clock-unavailable")).toEqual({ kind: "unavailable", reason: "invalid_snapshot" });
  });

  it("uses the host clock by default and never refreshes it during selected execution", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1700000000789);
    try {
      const f = fixture();
      const provenance = createAutomationStudioLlmRerunProvenance({ currentScope: () => f.current });
      await provenance.capture(f.request("default-clock"), f.producer);
      const found = provenance.lookup("default-clock");
      expect(found.kind).toBe("available");
      if (found.kind !== "available") throw new Error("test default host reference did not seal");
      expect(found.record.referenceNow).toBe(1700000000789);
      clock.mockReturnValue(1800000000987);
      expect((await provenance.execute(found.record, { callId: "default-selected" })).kind).toBe("returned");
      expect(f.requests.map((request) => request.referenceNow)).toEqual([1700000000789, 1700000000789]);
    } finally {
      clock.mockRestore();
    }
  });
});
