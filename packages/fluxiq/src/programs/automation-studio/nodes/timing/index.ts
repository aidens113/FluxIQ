import { debounceNode } from "./debounce";
import { retryNode } from "./retry";
import { timeoutNode } from "./timeout";
import { waitNode } from "./wait";

export const timingNodes = [waitNode, timeoutNode, retryNode, debounceNode];
