import { databaseInsertNode } from "./insert";
import { databaseQueryNode } from "./query";
import { databaseUpdateNode } from "./update";

export const databaseNodes = [databaseQueryNode, databaseInsertNode, databaseUpdateNode];
