import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import { decideAutomationStudioRuntimePatchRequest } from "../diagnosis-chain.ts";

// Fix 4, second half: diagnosis and patch were two independent calls, so a
// failed or malformed diagnosis still billed a second `runtime_patch` call.
describe("decideAutomationStudioRuntimePatchRequest", () => {
  it("requests a patch only after a diagnosis that succeeded and returned a diagnosis", () => {
    expect(decideAutomationStudioRuntimePatchRequest(diagnosis({ ok: true, kind: "diagnosis" }))).toMatchObject({ request: true });
  });

  it("requests no patch when the diagnosis call failed", () => {
    expect(decideAutomationStudioRuntimePatchRequest(diagnosis({ ok: false, kind: "diagnosis" }))).toMatchObject({ request: false });
  });

  it("requests no patch when the diagnosis returned something else, or nothing", () => {
    expect(decideAutomationStudioRuntimePatchRequest(diagnosis({ ok: true, kind: "instruction_suggestion" }))).toMatchObject({ request: false });
    expect(decideAutomationStudioRuntimePatchRequest(diagnosis({ ok: true }))).toMatchObject({ request: false });
    expect(decideAutomationStudioRuntimePatchRequest(undefined)).toMatchObject({ request: false });
  });
});

function diagnosis(input: { ok: boolean; kind?: "diagnosis" | "instruction_suggestion" }): AutomationStudioLlmTaskResult {
  const response = input.kind === "diagnosis"
    ? { kind: "diagnosis" as const, summary: "The action target no longer resolves." }
    : input.kind === "instruction_suggestion"
      ? { kind: "instruction_suggestion" as const, summary: "Write it down.", instructions: [{ title: "Use stable targets", body: "Prefer stable handles." }] }
      : undefined;
  return {
    ok: input.ok,
    request: {} as AutomationStudioLlmTaskResult["request"],
    ...(response ? { response } : {}),
    diagnostics: [],
    intervention: {} as AutomationStudioLlmTaskResult["intervention"]
  };
}
