import { afterEach, describe, expect, it } from "vitest";
import { localSetupCode } from "../setup-code";

// The local one-time setup code, held in this process's memory.

afterEach(() => {
  localSetupCode.spend();
});

describe("localSetupCode", () => {
  it("issues a 160-bit hex code that matches only itself", () => {
    const { code } = localSetupCode.issue(1_000);
    expect(code).toMatch(/^[0-9a-f]{40}$/u);
    expect(localSetupCode.check(code, 1_000)).toBe("valid");
    expect(localSetupCode.check(` ${code}\n`, 1_000)).toBe("valid");
    expect(localSetupCode.check(code.replace(/.$/u, (last) => (last === "0" ? "1" : "0")), 1_000)).toBe("wrong");
    expect(localSetupCode.check("", 1_000)).toBe("wrong");
  });

  it("expires after its lifetime, and says so only for the right code", () => {
    const { code, expiresAtMs } = localSetupCode.issue(1_000);
    expect(expiresAtMs).toBe(1_000 + localSetupCode.ttlMs);
    expect(localSetupCode.check(code, expiresAtMs - 1)).toBe("valid");
    expect(localSetupCode.check(code, expiresAtMs)).toBe("expired");
    expect(localSetupCode.check("0".repeat(40), expiresAtMs)).toBe("wrong");
  });

  it("works once: spent, no code is valid until the next start issues one", () => {
    const { code } = localSetupCode.issue(1_000);
    localSetupCode.spend();
    expect(localSetupCode.check(code, 1_000)).toBe("none");
  });

  it("a new start replaces the last code", () => {
    const first = localSetupCode.issue(1_000).code;
    const second = localSetupCode.issue(2_000).code;
    expect(first).not.toBe(second);
    expect(localSetupCode.check(first, 2_000)).toBe("wrong");
    expect(localSetupCode.check(second, 2_000)).toBe("valid");
  });
});
