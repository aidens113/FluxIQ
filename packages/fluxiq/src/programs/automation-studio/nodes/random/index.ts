import { jitterNode } from "./jitter.ts";
import { randomChoiceNode } from "./random-choice.ts";
import { randomNumberNode } from "./random-number.ts";
import { weightedChoiceNode } from "./weighted-choice.ts";

export const randomNodes = [randomNumberNode, randomChoiceNode, weightedChoiceNode, jitterNode];
