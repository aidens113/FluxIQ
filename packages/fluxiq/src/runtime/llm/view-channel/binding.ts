// A loop binding with the page channel turned on, and `core.full_page` beside its tools where the domain can capture a page whole (D1, D5).
//
// **The window's half.** The declared member and budget ride on the binding as
// `pageChannel`, which the loop passes to its window
// (`../decision-context/shown.ts`): each result's page is then shown whole
// once and as changes after (`./projection.ts`).
//
// **The tool's half.** Offered whenever the domain declares `fullPage`, from
// the first decision on, so the tool list never changes. Without a part it
// runs the domain's full capture and returns that view under the member: the
// window shows it whole and compares later views with it. With `part` it runs
// nothing and returns the request alone: the window answers it from the
// deliveries it holds, so a part is always one the model was offered, and a
// part that does not exist is told so -- never an ending. A capture the domain
// could not take is answered as unavailable, also never an ending.
//
// **The capture is read as a view, or as a result holding one under the
// member (t1042).** The web domain's hook answers with the result its tools
// answer with -- the published page, whose `pageView` is the view -- and was
// answered "unavailable" on every call while only a bare view was read. Either
// shape is read; nothing else of the result is shown.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { automationStudioActionPermissionDenied, type AutomationStudioActionPermissionCheck } from "../../action-permission-requests/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmPageChannel } from "./channel.ts";
import type { AutomationStudioLlmPageChannelDeclaration } from "./declaration.ts";
import { AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID } from "./tool-id.ts";
import { automationStudioLlmFullPageTool } from "./tool.ts";
import { automationStudioLlmPageViewOf } from "./view-of.ts";

type PageLoop = {
  tools: AutomationStudioLlmEvidenceTool[];
  executeTool(input: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal; permission?: AutomationStudioActionPermissionCheck }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
};

/** A member is a plain key of a result, as a top-level view key is (`../harness-options/registry.ts`). */
const MEMBER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u;

/**
 * `loop` with `pageChannel` set from `declared`, and `core.full_page` offered
 * after its tools when `declared.fullPage` is given; `loop` itself when nothing
 * is declared. Throws on a declaration that is not one, at bind time rather
 * than mid-build.
 */
export function automationStudioLlmPageChannelBinding<L extends PageLoop>(
  loop: L,
  declared: AutomationStudioLlmPageChannelDeclaration | undefined,
  context: { projectId: string; flowId: string }
): L & { pageChannel?: AutomationStudioLlmPageChannel } {
  if (!declared) return loop;
  if (typeof declared.member !== "string" || !MEMBER.test(declared.member)) throw new Error("Automation Studio page channel member is invalid.");
  if (declared.budgetChars !== undefined && !(Number.isInteger(declared.budgetChars) && declared.budgetChars > 0)) throw new Error("Automation Studio page channel budget is invalid.");
  const pageChannel: AutomationStudioLlmPageChannel = { member: declared.member, ...(declared.budgetChars !== undefined ? { budgetChars: declared.budgetChars } : {}) };
  const fullPage = declared.fullPage?.bind(declared);
  if (!fullPage || !loop.tools.length || loop.tools.some((tool) => tool.toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID)) return { ...loop, pageChannel };
  const executeTool = loop.executeTool.bind(loop);
  return {
    ...loop,
    pageChannel,
    tools: [...loop.tools, automationStudioLlmFullPageTool()],
    async executeTool(input: Parameters<L["executeTool"]>[0]) {
      if (input.toolId !== AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID) return await executeTool(input);
      const part = input.value.part;
      if (part !== undefined) {
        return { kind: "llm_evidence_tool_execution", evidence: { part: typeof part === "number" ? part : 0 }, effectApplied: false, resultCode: "core.full_page.part" } satisfies AutomationStudioLlmEvidenceToolExecutionResult;
      }
      const captured = await fullPage({
        projectId: context.projectId,
        flowId: context.flowId,
        callId: input.callId,
        permission: input.permission ?? automationStudioActionPermissionDenied,
        ...(input.signal ? { signal: input.signal } : {})
      });
      const view = captured === undefined ? undefined : automationStudioLlmPageViewOf(captured) ?? automationStudioLlmPageViewOf(captured[declared.member]);
      if (!view) {
        return { kind: "llm_evidence_tool_execution", evidence: { unavailable: "The whole page could not be captured just now; the page each result carries is still current." }, effectApplied: false, resultCode: "core.full_page.unavailable" } satisfies AutomationStudioLlmEvidenceToolExecutionResult;
      }
      return { kind: "llm_evidence_tool_execution", evidence: { [declared.member]: view }, effectApplied: false, resultCode: "core.full_page.captured" } satisfies AutomationStudioLlmEvidenceToolExecutionResult;
    }
  };
}
