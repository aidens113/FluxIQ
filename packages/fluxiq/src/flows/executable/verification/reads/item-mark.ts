/**
 * A sign the client read on one item itself, about the person's own relation
 * to the item's entity (framework plan P5b, t810; the client's CC2 marks).
 * `outside`: the item showed the person an offer to enter the set its entity
 * belongs to, so the person is not in it; `said` is the control's own words as
 * the page showed them, and `entity`, where the client could tell, the item's
 * linked name the offer is for. Core knows only "an item marked as outside the
 * person's set", never what kind of set or control the client found.
 */

export type ResultItemMark = { kind: "outside"; said: string; entity?: string };
