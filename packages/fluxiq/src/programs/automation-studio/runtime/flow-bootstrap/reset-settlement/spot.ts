// What reset settlement reads of where an act's control sat (t743): the
// subset of site-reset's `AutomationStudioSiteResetSpot`
// (`../site-reset/contracts.ts`) the settlement modules compare, written here
// so this directory needs nothing from site-reset, which depends on it one way.
// Opaque tokens, compared only for equality; every site-reset spot is one.

/** The opaque tokens of where an act's control sat that settlement compares: its item, list scope, subject, page, resource and own state. */
export type AutomationStudioSiteResetSettlementSpot = {
  item?: string | undefined;
  subject?: string | undefined;
  page?: string | undefined;
  scope?: string | undefined;
  resource?: string | undefined;
  state?: string | undefined;
};
