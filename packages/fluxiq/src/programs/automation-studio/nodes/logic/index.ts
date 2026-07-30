import { andNode } from "./and";
import { compareNode } from "./compare";
import { notNode } from "./not";
import { orNode } from "./or";

export const logicNodes = [compareNode, andNode, orNode, notNode];
