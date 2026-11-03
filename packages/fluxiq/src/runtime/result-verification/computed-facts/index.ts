// The facts Core settles about a result before any judge is asked (framework
// plan P5, K4): each kind in a module of its own (`count.ts`, `columns.ts`,
// `repeated.ts`, `verbatim.ts`, `kept-bounds.ts`, `order.ts`,
// `left-out-accounted.ts`, `act-passes.ts`), and every one of them in one
// order (`computed-facts.ts`), and the Core no they reach (`computed-no.ts`). A fact that fails is a Core no, located in
// Core's record, with no judge call (`../verify.ts`); a fact that holds is
// said to the judge as settled.

export * from "./act-passes.ts";
export * from "./columns.ts";
export * from "./computed-facts.ts";
export * from "./computed-no.ts";
export * from "./count.ts";
export * from "./kept-bounds.ts";
export * from "./left-out-accounted.ts";
export * from "./order.ts";
export * from "./repeated.ts";
export * from "./verbatim.ts";
