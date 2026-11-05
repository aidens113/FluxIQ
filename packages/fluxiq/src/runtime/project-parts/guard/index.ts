// Whether a saved part may run now: a pure answer over its card, its snapshot, what
// was asked, and a read of the page.
export { automationStudioPartGuard } from "./check.ts";
export { automationStudioPartClassWords } from "./class-words.ts";
export type {
  AutomationStudioPartAsked,
  AutomationStudioPartCaller,
  AutomationStudioPartGuardAnswer,
  AutomationStudioPartGuardCode,
  AutomationStudioPartGuardInput,
  AutomationStudioPartPageRead
} from "./types.ts";
