// Where FluxIQ keeps a developer's credentials: `FLUXIQ_CONFIG_DIR`, else `~/.fluxiq`.

import { homedir } from "node:os";
import path from "node:path";

/** The credentials directory: `FLUXIQ_CONFIG_DIR` when set, else `.fluxiq` in the home directory. */
export function fluxiqConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.FLUXIQ_CONFIG_DIR;
  return configured !== undefined && configured !== "" ? path.resolve(configured) : path.join(homedir(), ".fluxiq");
}
