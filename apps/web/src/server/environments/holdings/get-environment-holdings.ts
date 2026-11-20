import path from "node:path";
import { getEnvironmentStore } from "../environment-store";
import { EnvironmentHoldings } from "./environment-holdings";

const state = globalThis as typeof globalThis & { __fluxiqEnvironmentHoldings?: Map<string, EnvironmentHoldings> };
const registry = state.__fluxiqEnvironmentHoldings ??= new Map<string, EnvironmentHoldings>();

/**
 * The holdings of the environments under one FluxIQ root, shared by the
 * commerce composition's admission and the controller's store, and by
 * separately bundled routes. Called with the primary's resolved root only.
 */
export function getEnvironmentHoldings(platformRoot: string): EnvironmentHoldings {
  const root = path.resolve(platformRoot);
  let holdings = registry.get(root);
  if (!holdings) {
    holdings = new EnvironmentHoldings(getEnvironmentStore(root));
    registry.set(root, holdings);
  }
  return holdings;
}
