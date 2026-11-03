import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { NativeExchangeLogInvocation } from "../../native/index.ts";
import { automationStudioLlmStepLogOpenFolder } from "../index.ts";
import { openNativeExchangeLogFolder } from "../operation.ts";

it("shares one numbering cache between original and internal folder entries", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-folder-"));
  try {
    mkdirSync(path.join(directory, "0012-tool-old"));
    expect(automationStudioLlmStepLogOpenFolder(directory, "decide")).toEqual({ step: 13, name: "0013-decide", path: path.join(directory, "0013-decide") });
    rmSync(path.join(directory, "0013-decide"), { recursive: true });
    const invocation = new NativeExchangeLogInvocation();
    expect(openNativeExchangeLogFolder(directory, "judge", invocation)).toEqual({ step: 14, name: "0014-judge", path: path.join(directory, "0014-judge") });
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("acknowledged");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("retains the original refused-folder error instead of claiming disabled logging", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-native-folder-"));
  try {
    const blocked = path.join(directory, "blocked");
    writeFileSync(blocked, "existing file");
    const invocation = new NativeExchangeLogInvocation();
    let original: unknown;
    try {
      openNativeExchangeLogFolder(blocked, "decide", invocation);
    } catch (error) {
      original = error;
    }
    expect(original).toBeInstanceOf(Error);
    expect(NativeExchangeLogInvocation.failures(invocation)).toEqual([original]);
    expect(NativeExchangeLogInvocation.state(invocation)).toBe("failed");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
