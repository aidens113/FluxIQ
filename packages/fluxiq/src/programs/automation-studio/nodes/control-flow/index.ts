import { branchNode } from "./branch.ts";
import { endNode } from "./end.ts";
import { loopNode } from "./loop.ts";
import { mergeNode } from "./merge.ts";
import { parallelNode } from "./parallel.ts";
import { startNode } from "./start.ts";
import { switchNode } from "./switch.ts";

export const controlFlowNodes = [startNode, endNode, branchNode, switchNode, parallelNode, mergeNode, loopNode];
