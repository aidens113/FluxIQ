// Where the web panel's native client gateway server lives: the generator
// (`apps/web/scripts/build-client-gateway-server.mjs`) writes the artifact
// and its identity receipt into `apps/web/.server-runtime/`, which
// `web:build` treats as one of its outputs.

export const GATEWAY_FILES = Object.freeze({
  /** The generator, relative to the Core checkout. */
  generator: "apps/web/scripts/build-client-gateway-server.mjs",
  /** The artifact, relative to `apps/web`. */
  artifact: ".server-runtime/client-gateway-server.mjs",
  /** The receipt, relative to `apps/web`. */
  receipt: ".server-runtime/client-gateway-server.mjs.identity.json"
});
