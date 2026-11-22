import { fluxNodeSpecSchema, resolveFluxNodeOptions } from "@fluxiq/contracts/fluxnode";
import { expect, it } from "vitest";
import { automationStudioAnswerFirstCallerOptionsRead, automationStudioAnswerFirstKeptCallerOptions } from "../../answer-first/caller/index.ts";
import { fluxNodeCallerOptions } from "../caller-options.ts";

it("persists the true-only deterministic output restriction across carry-on", () => {
  const spec = fluxNodeSpecSchema.parse({ name: "library.rows", runtime: "library", start: "library://account", goal: "List records.", outputs: { type: "array" }, scope: { acts: [] } });
  const options = fluxNodeCallerOptions({ spec, specHash: "a".repeat(64), runId: "fnr-1", inputs: {}, bridge: undefined, personAsk: { raised: () => undefined }, options: resolveFluxNodeOptions(spec.options, undefined) });
  expect(options.requiresDataOutput).toBe(true);
  const kept = JSON.parse(JSON.stringify(automationStudioAnswerFirstKeptCallerOptions(options)));
  expect(automationStudioAnswerFirstCallerOptionsRead(kept).requiresDataOutput).toBe(true);
  expect(() => automationStudioAnswerFirstCallerOptionsRead({ requiresDataOutput: false })).toThrow("true-only");
});
