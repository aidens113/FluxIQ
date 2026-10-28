// Barrel for judging a trial by its change (t775): the contracts, the pure
// delta of one witness from before to after, the proof a part's typed effect
// gets from its witnesses, Core's closed findings over the change, and the
// bounded packet the judge sees. Reading the witnesses and wiring them into the
// trial gates is a later phase's; nothing here reads a page or a ledger.
export * from "./contracts.ts";
export * from "./delta.ts";
export * from "./findings.ts";
export * from "./packet.ts";
export * from "./proof.ts";
