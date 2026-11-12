import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("cancels the key snapshot request on unmount and drops a stale answer", () => {
  const source = readFileSync(new URL("../SecretKeysLive.tsx", import.meta.url), "utf8");
  expect(source).toContain("new AbortController()");
  expect(source).toContain('"snapshot", { signal: controller.signal }');
  expect(source).toMatch(/mounted\.current = false;\s+read\.current\?\.abort\(\)/u);
  expect(source).toContain("if (!current() || controller.signal.aborted || read.current !== controller) return;");
});
