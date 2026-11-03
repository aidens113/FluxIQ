import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { NativeExchangeLogInvocation } from "../index.ts";
import { automationStudioLlmStepLogDirectory } from "../../directory.ts";

it("retains original native ACKs without deriving them from an empty operation", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-log-"));
  try {
    const invocation = new NativeExchangeLogInvocation();
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("unused");
    NativeExchangeLogInvocation.write(invocation, path.join(directory, "body.json"), "{\"kept\":true}\n");
    expect(readFileSync(path.join(directory, "body.json"), "utf8")).toBe("{\"kept\":true}\n");
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("acknowledged");
    expect(NativeExchangeLogInvocation.failures(invocation)).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("keeps an actual native error even after a later operation succeeds", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-log-"));
  try {
    const invocation = new NativeExchangeLogInvocation();
    let original: unknown;
    try {
      NativeExchangeLogInvocation.write(invocation, directory, "cannot replace a directory");
    } catch (error) {
      original = error;
    }
    expect(original).toBeInstanceOf(Error);
    NativeExchangeLogInvocation.write(invocation, path.join(directory, "later.txt"), "later\n");
    expect(readFileSync(path.join(directory, "later.txt"), "utf8")).toBe("later\n");
    expect(NativeExchangeLogInvocation.failures(invocation)).toEqual([original]);
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("failed");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("refuses copied and proxy invocation objects without invoking their traps", () => {
  const invocation = new NativeExchangeLogInvocation();
  let traps = 0;
  const proxy = new Proxy(invocation, {
    get() {
      traps += 1;
      throw new Error("unexpected get");
    },
    getOwnPropertyDescriptor() {
      traps += 1;
      throw new Error("unexpected descriptor");
    },
    getPrototypeOf() {
      traps += 1;
      throw new Error("unexpected prototype");
    }
  });
  expect(() => NativeExchangeLogInvocation.assert(proxy)).toThrow("exchange_log.foreign_native_invocation");
  expect(() => Reflect.apply(NativeExchangeLogInvocation.assert, NativeExchangeLogInvocation, [{ ...invocation }])).toThrow("exchange_log.foreign_native_invocation");
  expect(traps).toBe(0);
  expect(NativeExchangeLogInvocation.state(invocation)).toBe("unused");
});

it("pins the original clock and rejects a later accessor without invoking it", () => {
  const before = new NativeExchangeLogInvocation();
  const descriptor = Object.getOwnPropertyDescriptor(Date, "now");
  if (!descriptor) throw new Error("Native clock descriptor missing.");
  let reads = 0;
  try {
    Object.defineProperty(Date, "now", {
      configurable: true,
      get() {
        reads += 1;
        throw new Error("clock accessor");
      }
    });
    const after = new NativeExchangeLogInvocation();
    expect(typeof NativeExchangeLogInvocation.now(before)).toBe("number");
    expect(() => NativeExchangeLogInvocation.now(after)).toThrow("exchange_log.native_identity_unavailable");
    expect(NativeExchangeLogInvocation.state(after)).toBe("unsupported");
    expect(reads).toBe(0);
  } finally {
    Object.defineProperty(Date, "now", descriptor);
  }
});

it("distinguishes the original disabled environment branch from unsupported getters", () => {
  const saved = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  try {
    delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    const disabled = new NativeExchangeLogInvocation();
    expect(NativeExchangeLogInvocation.directory(disabled)).toBeUndefined();
    expect(NativeExchangeLogInvocation.state(disabled)).toBe("disabled");
    let reads = 0;
    const environment = {
      get FLUXIQ_LLM_STEP_LOG_DIR() {
        reads += 1;
        return "relative";
      }
    };
    const unsupported = new NativeExchangeLogInvocation();
    expect(NativeExchangeLogInvocation.directory(unsupported, environment)).toBeUndefined();
    expect(NativeExchangeLogInvocation.state(unsupported)).toBe("unsupported");
    expect(reads).toBe(0);
    expect(automationStudioLlmStepLogDirectory(environment)).toBeUndefined();
    expect(reads).toBe(1);
  } finally {
    if (saved === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    else process.env.FLUXIQ_LLM_STEP_LOG_DIR = saved;
  }
});

it("refuses proxy environment identity before reading any descriptor", () => {
  let traps = 0;
  const environment = new Proxy({}, {
    get() {
      traps += 1;
      throw new Error("environment get");
    },
    getOwnPropertyDescriptor() {
      traps += 1;
      throw new Error("environment descriptor");
    }
  });
  const invocation = new NativeExchangeLogInvocation();
  expect(NativeExchangeLogInvocation.directory(invocation, environment)).toBeUndefined();
  expect(NativeExchangeLogInvocation.state(invocation)).toBe("unsupported");
  expect(traps).toBe(0);
});

it("cannot retain a disabled-branch claim and perform native IO afterward", () => {
  const saved = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-log-"));
  try {
    delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    const invocation = new NativeExchangeLogInvocation();
    expect(NativeExchangeLogInvocation.directory(invocation)).toBeUndefined();
    expect(() => NativeExchangeLogInvocation.write(invocation, path.join(directory, "forbidden.txt"), "must not be written")).toThrow("exchange_log.native_identity_unavailable");
    expect(existsSync(path.join(directory, "forbidden.txt"))).toBe(false);
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("unsupported");
  } finally {
    if (saved === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    else process.env.FLUXIQ_LLM_STEP_LOG_DIR = saved;
    rmSync(directory, { recursive: true, force: true });
  }
});
