/**
 * What a model may write as `place` (D phase 2): the places on the route the
 * person named that one step is on, by the draft's ids for them (`r1`, `r2`
 * ... in the route's order), comma-separated with no space, or `none` to say
 * the step is on none. A route has at most 20 places
 * (`../../action-permissions/instruction-route/schema.ts`).
 */
export const AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE = /^(none|r[1-9][0-9]?(,r[1-9][0-9]?){0,19})$/u;
