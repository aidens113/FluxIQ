import { expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_BUILD_CALL_LIMIT_ENV as value, AUTOMATION_STUDIO_LLM_BUILD_CALL_LIMIT_SCOPE_ENV as scope, resolveAutomationStudioLlmBuildCallLimit as resolve } from "../index.ts";

it("has no ordinary UI default and ignores malformed unscoped test configuration", () => {
  expect(resolve({})).toBeUndefined();
  expect(resolve({ [value]: "invalid" })).toBeUndefined();
  expect(resolve({ [scope]: "production", [value]: "48" })).toBeUndefined();
  expect(resolve({ [scope]: "test" })).toBeUndefined();
});
it("reads the exact scoped allowance, without a hardcoded 48", () => {
  expect(resolve({ [scope]: "test", [value]: "3" })).toBe(3);
  expect(resolve({ [scope]: "test", [value]: "48" })).toBe(48);
  for (const invalid of ["", "0", "-1", "3.5", "Infinity", "9007199254740992", "three"]) expect(() => resolve({ [scope]: "test", [value]: invalid })).toThrow("positive safe integer");
});
