// The page channel as a domain binds it (`../harness-options/binding.ts`, D1, D5).
//
// `member` and `budgetChars` are what the window reads (`./channel.ts`).
// `fullPage` takes a full capture of the page the work is on -- hidden
// elements and their attributes included, as `extra` lines -- and returns it
// as a page view (`./view.ts`). Its input is shaped like `observeResult`'s. It
// only reads. Declared, the loop offers `core.full_page` from its first
// decision on, so the tool list never changes mid-run.

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../action-permission-requests/index.ts";

/** A domain's page channel declaration. */
export type AutomationStudioLlmPageChannelDeclaration = {
  member: string;
  budgetChars?: number;
  fullPage?(input: { projectId: string; flowId: string; callId: string; permission: AutomationStudioActionPermissionCheck; signal?: AbortSignal }): Promise<JsonObject | undefined>;
};
