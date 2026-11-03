/**
 * The shape of an id the checklist gives: an act, `a` and its number, or a
 * choice the person made for that act's item, the act's id and what it fixes
 * (`a2.quantity`, `a2.size`; `../../flow-bootstrap/instructed-acts/instruction-choices.ts`).
 */
export const AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID = /^a[1-9][0-9]{0,2}(?:\.[a-z]{1,16})?$/u;
