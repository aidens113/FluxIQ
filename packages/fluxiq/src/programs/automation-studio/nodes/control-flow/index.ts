import { branchNode } from "./branch";
import { endNode } from "./end";
import { loopNode } from "./loop";
import { mergeNode } from "./merge";
import { parallelNode } from "./parallel";
import { startNode } from "./start";
import { switchNode } from "./switch";

export const controlFlowNodes = [startNode, endNode, branchNode, switchNode, parallelNode, mergeNode, loopNode];
