import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * A production build resolves Core's packages from their built `dist`, and
 * `next dev` from their source.
 *
 * `tsconfig.json` extends Core's `tsconfig.base.json`, whose `paths` send
 * `fluxiq` and `@fluxiq/contracts` to `packages/<name>/src`, and Turbopack
 * honours them. That is what `next dev` wants: an edit to Core's source shows
 * at once. A production build compiled that way embeds the source's runtime
 * identity placeholder (`packages/fluxiq/src/runtime/build-identity/read.ts`),
 * which only the `dist` build stamps, so the served panel could not attest
 * which Core it runs. `tsconfig.build.json` drops those aliases, so the build
 * resolves `node_modules/fluxiq`, whose exports point at the stamped `dist`.
 * `web:build` refuses an output that still embeds the placeholder
 * (`scripts/web-build/identity/`).
 */
export default function nextConfig(phase: string): NextConfig {
  return {
    transpilePackages: ["fluxiq"],
    ...(phase === PHASE_PRODUCTION_BUILD ? { typescript: { tsconfigPath: "tsconfig.build.json" } } : {})
  };
}
