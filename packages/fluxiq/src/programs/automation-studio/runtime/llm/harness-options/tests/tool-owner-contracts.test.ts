import { expectTypeOf, it } from "vitest";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/agents/tools/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult as LegacyExecutionResult } from "../../evidence-loop/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding as LegacyLoopBinding } from "../registry.ts";

it("retains the complete tool execution result through the legacy export", () => {
  expectTypeOf<LegacyExecutionResult>().toEqualTypeOf<AutomationStudioLlmEvidenceToolExecutionResult>();
  expectTypeOf<AutomationStudioLlmEvidenceToolExecutionResult>().toEqualTypeOf<LegacyExecutionResult>();
});

it("retains the complete binding and executeTool input and return contracts", () => {
  expectTypeOf<LegacyLoopBinding>().toEqualTypeOf<AutomationStudioHarnessOptionLoopBinding>();
  expectTypeOf<AutomationStudioHarnessOptionLoopBinding>().toEqualTypeOf<LegacyLoopBinding>();
  expectTypeOf<Parameters<LegacyLoopBinding["executeTool"]>>().toEqualTypeOf<Parameters<AutomationStudioHarnessOptionLoopBinding["executeTool"]>>();
  expectTypeOf<ReturnType<LegacyLoopBinding["executeTool"]>>().toEqualTypeOf<ReturnType<AutomationStudioHarnessOptionLoopBinding["executeTool"]>>();
});
