import { andNode } from "./and.ts";
import { compareNode } from "./compare.ts";
import { notNode } from "./not.ts";
import { orNode } from "./or.ts";

export const logicNodes = [compareNode, andNode, orNode, notNode];

export * from "./and.ts";
export * from "./compare.ts";
export * from "./not.ts";
export * from "./or.ts";
export * from "./shared.ts";
