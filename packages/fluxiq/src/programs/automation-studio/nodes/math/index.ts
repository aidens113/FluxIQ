import { addNode } from "./add.ts";
import { clampNode } from "./clamp.ts";
import { divideNode } from "./divide.ts";
import { multiplyNode } from "./multiply.ts";
import { roundNode } from "./round.ts";
import { subtractNode } from "./subtract.ts";

export const mathNodes = [addNode, subtractNode, multiplyNode, divideNode, clampNode, roundNode];
