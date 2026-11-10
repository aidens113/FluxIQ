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
    // No page of the panel may be framed: a page on another local port counts
    // as the same site for the session cookie, so a frame could lure a press on
    // Allow or Delete, which mints a press grant.
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
            { key: "X-Frame-Options", value: "DENY" }
          ]
        }
      ];
    },
    // The old Studio workspace, the domain pages and the first-run page are gone;
    // links and bookmarks to them land on the page that replaced them. Not
    // permanent: `/get-started` gets the setup wizard back when it lands. The
    // query string is carried over, so `?project=` reaches `/flows`. Other
    // `/programs/<id>` pages stay (Settings links to them), as do `/setup`,
    // `/welcome`, `/reset` and sign-in.
    async redirects() {
      return [
        { source: "/programs/automation-studio/chat", destination: "/?chat=open", permanent: false },
        { source: "/programs/automation-studio/:path*", destination: "/flows", permanent: false },
        { source: "/domains/:path*", destination: "/flows", permanent: false },
        { source: "/get-started/:path*", destination: "/", permanent: false }
      ];
    },
    ...(phase === PHASE_PRODUCTION_BUILD ? { typescript: { tsconfigPath: "tsconfig.build.json" } } : {})
  };
}
