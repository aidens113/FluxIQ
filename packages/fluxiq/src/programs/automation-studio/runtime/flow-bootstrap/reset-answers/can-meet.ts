// Where a call can meet a site-reset refusal's failed condition (t743, the
// actionable-answer contract, `./refusal.ts`): on this page, only elsewhere, or
// nowhere -- in which case the model is told not to make the call again.

/** Where a call can meet the failed condition: on this page, only elsewhere, or nowhere. */
export const AUTOMATION_STUDIO_SITE_RESET_CAN_MEET = ["this_page", "another_page", "no_call"] as const;

/** Whether any call can meet a refusal's failed condition, and where. */
export type AutomationStudioSiteResetCanMeet = (typeof AUTOMATION_STUDIO_SITE_RESET_CAN_MEET)[number];

