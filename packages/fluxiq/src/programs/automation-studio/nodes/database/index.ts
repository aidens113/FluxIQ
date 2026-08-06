import { databaseInsertNode } from "./insert.ts";
import { databaseQueryNode } from "./query.ts";
import { databaseUpdateNode } from "./update.ts";

export const databaseNodes = [databaseQueryNode, databaseInsertNode, databaseUpdateNode];
