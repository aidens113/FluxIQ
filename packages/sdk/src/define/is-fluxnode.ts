// Tells a FluxNode `defineFluxNode` made from any other value.

import type { TypeSchemaInput } from "../schema/index.ts";
import { FLUXNODE_MARK } from "./fluxnode-mark.ts";
import type { FluxNode } from "./types.ts";

/** True when `value` came from `defineFluxNode`. */
export function isFluxNode(value: unknown): value is FluxNode<TypeSchemaInput | undefined, TypeSchemaInput | undefined> {
  return typeof value === "object" && value !== null && (value as { [FLUXNODE_MARK]?: boolean })[FLUXNODE_MARK] === true;
}
