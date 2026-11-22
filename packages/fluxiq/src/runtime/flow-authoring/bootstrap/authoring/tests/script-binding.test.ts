import { expect, it } from "vitest";
import { automationStudioScriptBinding } from "../script-binding.ts";

const scope = { labelKeys: new Map<string, string>(), elsewhere: () => false };

it.each(["latest_date", "LatestDate", "_leading", "a".repeat(65), "constructor", "prototype", "__proto__"])("preserves public identifier %s in written bindings", (name) => {
  expect(automationStudioScriptBinding(`$input.${name} = example`, undefined, scope)).toEqual({ value: { $state: { path: name, fallback: "example" } } });
  expect(automationStudioScriptBinding(`$input.${name}`, undefined, { ...scope, partInputs: new Set([name]) })).toEqual({ value: { $state: { path: name } } });
});

it.each(["item", "a.b", "a/b", "1name"])("refuses unsupported input identifier %s with the shared rule", (name) => {
  expect(automationStudioScriptBinding(`$input.${name} = example`, undefined, scope)).toMatchObject({ refused: expect.stringContaining("ASCII letter or underscore") });
});
