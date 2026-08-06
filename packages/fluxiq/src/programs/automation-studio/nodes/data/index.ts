import { constantNode } from "./constant.ts";
import { filterListNode } from "./filter-list.ts";
import { getVariableNode } from "./get-variable.ts";
import { mapObjectNode } from "./map-object.ts";
import { setVariableNode } from "./set-variable.ts";

export const dataNodes = [constantNode, getVariableNode, setVariableNode, mapObjectNode, filterListNode];
