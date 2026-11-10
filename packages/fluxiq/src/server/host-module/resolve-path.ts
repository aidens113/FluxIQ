import { existsSync } from "node:fs";
import path from "node:path";

/** The domain host module `FLUXIQ_HOST_MODULE` names, resolved, or null when none is set; a missing file throws. */
export function resolveFluxIQHostModulePath(): string | null {
  const hostModulePath = process.env.FLUXIQ_HOST_MODULE;
  if (!hostModulePath?.trim()) return null;
  const resolved = path.resolve(hostModulePath.trim());
  if (!existsSync(resolved)) {
    throw new Error(`FLUXIQ_HOST_MODULE points to a missing file: ${resolved}`);
  }
  return resolved;
}
