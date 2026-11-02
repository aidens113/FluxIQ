import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

/**
 * Core's answer. `permitted: false` always means: do not take the action.
 *
 * `requestId` names the request that was raised for the person, and is `null`
 * only where there is nobody to ask -- a caller that ran the domain's action
 * without a run behind it. Either way the action does not happen.
 *
 * `declined` is present, and `true`, only when the refusal is a person's
 * explicit no to this very question: the same control, asked about the same
 * classes. The request it names has been answered and is not in front of
 * anybody, so a domain tells its model not to make the action again rather
 * than that a person is being asked. Absent means the request is still open,
 * or nobody answered it, or there was nobody to ask. Optional, so a domain
 * that never reads it is answered exactly as before.
 */
export type AutomationStudioActionPermissionVerdict =
  | { permitted: true }
  | { permitted: false; missing: readonly AutomationStudioActionConsequence[]; requestId: string | null; declined?: true };
