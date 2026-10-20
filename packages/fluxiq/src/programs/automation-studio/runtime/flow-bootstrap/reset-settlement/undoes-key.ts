// The `core.run_node` input key under which a call names the act of this
// build it undoes (t462). Moved here from `../site-reset/contracts.ts` (t743)
// because the settle words (`./words.ts`) say it and this directory needs
// nothing from site-reset; site-reset's barrel re-exports it unchanged.

/** The `core.run_node` input key under which a call names the act of this build it undoes. */
export const AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY = "undoes";
