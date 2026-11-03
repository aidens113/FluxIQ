import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { NativeExchangeLogInvocation } from "../../native/index.ts";
import { automationStudioLlmStepLogListStep } from "../index.ts";
import { listNativeExchangeLogStep } from "../operation.ts";

it("retains the exact index bytes and the same cache across public and internal calls", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-index-"));
  try {
    automationStudioLlmStepLogListStep(directory, { step: 1, kind: "decide", tool: undefined, summary: "old", costUsd: undefined });
    mkdirSync(path.join(directory, "0008-decide"));
    writeFileSync(path.join(directory, "0008-decide", "meta.json"), '{"step":8,"kind":"decide","summary":"not reread"}');
    const invocation = new NativeExchangeLogInvocation();
    expect(listNativeExchangeLogStep(directory, { step: 2, kind: "judge", tool: undefined, summary: "new", costUsd: 0.1 }, invocation)).toBeUndefined();
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toBe("# Run steps\n\nOne row per completed step folder, in step order. A folder is complete once it holds `meta.json`.\n\n| Step | Kind | Tool | Summary | Cost |\n| --- | --- | --- | --- | --- |\n| 0001 | decide | - | old | - |\n| 0002 | judge | - | new | $0.100000 |\n");
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("acknowledged");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("keeps a completed temp write and both native rename/fallback failures visible", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-index-"));
  try {
    mkdirSync(path.join(directory, "index.md"));
    writeFileSync(path.join(directory, "index.md", "occupied"), "existing data");
    const invocation = new NativeExchangeLogInvocation();
    expect(listNativeExchangeLogStep(directory, { step: 1, kind: "decide", tool: undefined, summary: "new", costUsd: undefined }, invocation)).toBeUndefined();
    expect(readdirSync(directory).filter(name => /^\.index\.md\..*\.tmp$/u.test(name))).toHaveLength(1);
    expect(NativeExchangeLogInvocation.failures(invocation)).toHaveLength(2);
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("failed");
    expect(readFileSync(path.join(directory, "index.md", "occupied"), "utf8")).toBe("existing data");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("retains a skipped corrupt meta failure even when the index is written", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-index-"));
  try {
    mkdirSync(path.join(directory, "0001-decide"));
    writeFileSync(path.join(directory, "0001-decide", "meta.json"), "{broken");
    const invocation = new NativeExchangeLogInvocation();
    listNativeExchangeLogStep(directory, { step: 2, kind: "judge", tool: undefined, summary: "current", costUsd: undefined }, invocation);
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toContain("| 0002 | judge | - | current | - |");
    expect(NativeExchangeLogInvocation.failures(invocation)[0]).toBeInstanceOf(SyntaxError);
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("failed");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("retains a swallowed row-format failure after a genuine directory read", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-index-"));
  try {
    const original = new Error("synthetic row failure");
    const row = { step: 1, kind: "decide", tool: undefined, costUsd: undefined, get summary(): string { throw original; } };
    const invocation = new NativeExchangeLogInvocation();
    expect(listNativeExchangeLogStep(directory, row, invocation)).toBeUndefined();
    expect(NativeExchangeLogInvocation.failures(invocation)).toEqual([original]);
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("failed");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
