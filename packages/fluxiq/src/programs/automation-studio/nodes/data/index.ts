import { constantNode } from "./constant";
import { filterListNode } from "./filter-list";
import { getVariableNode } from "./get-variable";
import { mapObjectNode } from "./map-object";
import { setVariableNode } from "./set-variable";

export const dataNodes = [constantNode, getVariableNode, setVariableNode, mapObjectNode, filterListNode];
