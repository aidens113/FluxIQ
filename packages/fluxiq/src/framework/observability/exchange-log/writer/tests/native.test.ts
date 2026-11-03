import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { NativeExchangeLogInvocation } from "../../native/index.ts";
import { automationStudioLlmStepLogWriter } from "../index.ts";
import { NativeExchangeLogWriter } from "../native.ts";

it("preserves exact bytes and the redaction state across distinct current invocations", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-writer-"));
  try {
    const owner = new NativeExchangeLogWriter(directory);
    const request = new NativeExchangeLogInvocation();
    const response = new NativeExchangeLogInvocation();
    const finish = new NativeExchangeLogInvocation();
    expect(Object.keys(owner.writer)).toEqual(["folder", "text", "json", "meta"]);
    expect(owner.text("request.json", "{\"value\":\"sk-abcdefghijklmnopqrstuvwx\"}\n", request)).toBeUndefined();
    expect(owner.text("response.json", new Uint8Array([123, 125, 10]), response)).toBeUndefined();
    expect(owner.meta({ step: 1, kind: "decide" }, finish)).toBeUndefined();
    expect(readFileSync(path.join(directory, "request.json"), "utf8")).toBe("{\"value\":\"[redacted-credential]\"}\n");
    expect(readFileSync(path.join(directory, "response.json"))).toEqual(Buffer.from([123, 125, 10]));
    expect(readFileSync(path.join(directory, "meta.json"), "utf8")).toBe('{\n  "step": 1,\n  "kind": "decide",\n  "redacted": true\n}\n');
    for (const invocation of [request, response, finish]) expect(NativeExchangeLogInvocation.state(invocation)).toBe("acknowledged");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("retains a swallowed partial write without contaminating the next call's driver", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-writer-"));
  try {
    mkdirSync(path.join(directory, "request.json"));
    const owner = new NativeExchangeLogWriter(directory);
    const request = new NativeExchangeLogInvocation();
    const reply = new NativeExchangeLogInvocation();
    expect(owner.text("request.json", "request", request)).toBeUndefined();
    expect(NativeExchangeLogInvocation.state(request)).toBe("failed");
    expect(NativeExchangeLogInvocation.failures(request)).toHaveLength(1);
    owner.text("response.json", "reply", reply);
    expect(readFileSync(path.join(directory, "response.json"), "utf8")).toBe("reply");
    expect(NativeExchangeLogInvocation.state(reply)).toBe("acknowledged");
    expect(NativeExchangeLogInvocation.state(request)).toBe("failed");
    expect(automationStudioLlmStepLogWriter(directory).text("request.json", "legacy")).toBeUndefined();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("writes the original serialization fallback but retains its failure", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-writer-"));
  try {
    const value: { loop?: unknown } = {};
    value.loop = value;
    const owner = new NativeExchangeLogWriter(directory);
    const invocation = new NativeExchangeLogInvocation();
    expect(owner.json("decision.json", value, invocation)).toBeUndefined();
    expect(readFileSync(path.join(directory, "decision.json"), "utf8")).toBe('{"unserializable":"TypeError"}\n');
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("failed");
    expect(NativeExchangeLogInvocation.failures(invocation)[0]).toBeInstanceOf(TypeError);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("preserves a meta serialization error while making it visible to the current owner", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-writer-"));
  try {
    const original = new Error("synthetic serializer failure");
    const record = { toJSON() { throw original; } };
    const owner = new NativeExchangeLogWriter(directory);
    const invocation = new NativeExchangeLogInvocation();
    expect(() => owner.meta(record, invocation)).toThrow(original);
    expect(NativeExchangeLogInvocation.failures(invocation)).toEqual([original]);
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("failed");
    expect(() => owner.writer.meta(record)).toThrow(original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
