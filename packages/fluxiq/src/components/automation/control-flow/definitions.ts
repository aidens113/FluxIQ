import { branchNode } from "./branch.ts";
import { callSubflowNode } from "./call-subflow.ts";
import { endNode } from "./end.ts";
import { forEachNode } from "./for-each.ts";
import { handlerNode } from "./handler.ts";
import { handlerEndNode } from "./handler-end.ts";
import { loopNode } from "./loop.ts";
import { mergeNode } from "./merge.ts";
import { parallelNode } from "./parallel.ts";
import { repeatNode } from "./repeat.ts";
import { startNode } from "./start.ts";
import { switchNode } from "./switch.ts";


export const controlFlowNodes = [startNode, endNode, branchNode, switchNode, parallelNode, mergeNode, loopNode, forEachNode, repeatNode, handlerNode, handlerEndNode, callSubflowNode];
