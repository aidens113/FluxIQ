// The environment `next build` runs with in a staged attempt: the caller's,
// with a FluxIQ root of the attempt's own and the client gateway disabled.
// Prerendering may construct the FluxIQ runtime, and it must neither touch
// any real data nor bind a port. Core reads every `FLUXIQ_*` value when a
// request arrives, so `next start` supplies its own values to the same build.
// What else to drop from the caller's environment is the caller's choice: the
// key fingerprints `NODE_ENV` and every `NEXT_*` variable, as `web:build` does.

import path from "node:path";

/**
 * @param {NodeJS.ProcessEnv} base
 * @param {string} fluxiqRoot a directory inside the attempt
 * @returns {NodeJS.ProcessEnv}
 */
export function isolatedBuildEnvironment(base, fluxiqRoot) {
  const storage = path.join(fluxiqRoot, ".fluxiq");
  return {
    ...base,
    FLUXIQ_ROOT: fluxiqRoot,
    FLUXIQ_IMPORTER_ROOT: fluxiqRoot,
    FLUXIQ_HOST_ROOT: fluxiqRoot,
    FLUXIQ_DATA_DIR: storage,
    FLUXIQ_DATABASES_DIR: storage,
    FLUXIQ_CLIENT_GATEWAY_ENABLED: "false"
  };
}
