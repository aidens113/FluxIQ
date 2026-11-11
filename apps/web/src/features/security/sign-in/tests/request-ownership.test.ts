import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("cancels the identity snapshot request on unmount and drops a stale answer", () => {
  const source = readFileSync(new URL("../IdentityAccessLive.tsx", import.meta.url), "utf8");
  expect(source).toContain("new AbortController()");
  expect(source).toContain('"snapshot", { signal: controller.signal }');
  expect(source).toMatch(/mounted\.current = false;\s+\+\+readJob\.current\.id;\s+readJob\.current\.controller\?\.abort\(\)/u);
  expect(source).toContain("readJob.current.id === id");
  expect(source).toContain("if (!readCurrent()) return;");
});
