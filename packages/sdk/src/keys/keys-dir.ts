// Private keys live only under `<config dir>/keys/`; a project never holds one.

import path from "node:path";
import { fluxiqConfigDir } from "./config-dir.ts";

/** The folder private keys live in. */
export function fluxiqKeysDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(fluxiqConfigDir(env), "keys");
}
