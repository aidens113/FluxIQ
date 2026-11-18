import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { writeCoreBridge } from "./scripts/core-bridge/index.mjs";
import { assertCoreTraced } from "./scripts/core-trace/index.mjs";
import { assertOneCoreGraph } from "./scripts/one-core-graph/index.mjs";

/**
 * The panel server holds one copy of Core, loaded by Node from its built
 * `dist`, in every mode.
 *
 * Next compiles instrumentation, route handlers and pages as separate graphs
 * (different module ids, and a separate Turbopack runtime for pages), so a
 * bundled Core is evaluated once per graph and each copy has its own
 * module-level state: runs published activity to the instrumentation's hub
 * while `/api/panel/changes` listened to the routes', and `iamStoreChanges`,
 * the database operation locks, `AsyncLocalStorage` scopes and every WeakMap
 * side table were split the same way. `serverExternalPackages: ["fluxiq"]`
 * alone cannot fix it: Turbopack externalizes only a package whose resolved
 * file is under `node_modules`, and `fluxiq` is a pnpm workspace link to
 * `packages/fluxiq`, so it is silently bundled. `writeCoreBridge`
 * (`scripts/core-bridge/`) writes a real package under the workspace root's
 * `node_modules` that re-exports each Core entry point by name. Every `fluxiq`
 * import is aliased to it and it is external, so Turbopack leaves the import
 * to Node under the request as written (`fluxiq/server`), and Node loads Core
 * once by its real path through `node_modules/fluxiq`. Instrumentation,
 * routes, pages, the client gateway's native server and the extension's host
 * module (both load `fluxiq` through Node) share that one graph. A browser or
 * edge bundle (middleware) bundles the bridge's named re-exports through to
 * Core and keeps only what it uses.
 *
 * The alias wins over the source `paths` of `tsconfig.json`, so `next dev`
 * also runs Core's `dist`: an edit to Core's source shows after Core's
 * library build and a restart, not at once. That is the price of one graph
 * in dev too, whose split state (the database write locks among it) was the
 * same bug. A production build type-checks with `tsconfig.build.json`, which
 * has no source aliases. `web:build` refuses an output that embeds Core's
 * unstamped runtime identity (`scripts/web-build/identity/`). After each
 * production compile `assertOneCoreGraph` (`scripts/one-core-graph/`) fails
 * the build if any Core module is still bundled more than once, and
 * `assertCoreTraced` (`scripts/core-trace/`) if the server's traces, which a
 * standalone output copies, lack what Node needs to load Core.
 */
export default function nextConfig(phase: string): NextConfig {
  // Next compiles this file as CommonJS from `apps/web`, so `__dirname` is `apps/web`.
  const coreBridge = writeCoreBridge(__dirname);
  return {
    serverExternalPackages: [coreBridge.name],
    turbopack: { resolveAlias: coreBridge.aliases },
    compiler: {
      async runAfterProductionCompile({ distDir, projectDir }) {
        const { files, bundled } = await assertOneCoreGraph({ distDirectory: distDir, coreDirectory: path.join(projectDir, "node_modules", "fluxiq") });
        console.log(`One Core graph: ${files} Node server files bundle ${bundled} Core module(s), none more than once.`);
        const gateway = path.join(projectDir, ".server-runtime", "client-gateway-server.mjs");
        const { requests, traced } = await assertCoreTraced({ distDirectory: distDir, webDirectory: projectDir, modules: [gateway] });
        console.log(`Core trace: the Node server's ${traced} traced files carry all ${requests} Core entry points it imports through Node.`);
      }
    },
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
    // The old Studio workspace, the domain pages, the first-run page and the
    // `/programs/*` screens are gone; links and bookmarks to them land on the page
    // that replaced them. Not permanent: `/get-started` gets the setup wizard back
    // when it lands. The query string is carried over, so `?project=` reaches
    // `/flows` and `?doc=` reaches the Docs tool. Each retired program page goes to
    // the screen that now does its job: keys and your own sign-in are Security's
    // sub-pages, every other engine tool is a Settings sub-page of the same id, and
    // bare `/programs` (or an id that never had a page) lands on Settings.
    // `/setup`, `/welcome`, `/reset` and sign-in stay.
    async redirects() {
      return [
        { source: "/programs/automation-studio/chat", destination: "/?chat=open", permanent: false },
        { source: "/programs/automation-studio/:path*", destination: "/flows", permanent: false },
        { source: "/programs/identity-access", destination: "/security/sign-in", permanent: false },
        { source: "/programs/secret-keys", destination: "/security/keys", permanent: false },
        { source: "/programs/:tool(background-tasks|compute-control|database-manager|deployment-sync|docs|production-runner|runtime)", destination: "/settings/:tool", permanent: false },
        { source: "/programs/:path*", destination: "/settings", permanent: false },
        { source: "/domains/:path*", destination: "/flows", permanent: false },
        { source: "/get-started/:path*", destination: "/", permanent: false }
      ];
    },
    ...(phase === PHASE_PRODUCTION_BUILD ? { typescript: { tsconfigPath: "tsconfig.build.json" } } : {}),
    ...(process.env.FLUXIQ_WEB_STANDALONE === "1" ? standaloneOutput() : {})
  };
}

/**
 * The container image's build (`deploy/docker/Dockerfile`) sets
 * `FLUXIQ_WEB_STANDALONE=1`: Next then also writes `.next/standalone`, a
 * server holding only the files it traced, so the image carries no workspace
 * install. Tracing starts at the repository root because the panel reaches
 * Core's packages through pnpm's workspace links above `apps/web`. Every
 * other build, and `next dev`, are unchanged. Next compiles this file as
 * CommonJS from `apps/web` (`next/dist/build/next-config-ts`), so `__dirname`
 * is `apps/web`.
 */
function standaloneOutput(): Pick<NextConfig, "output" | "outputFileTracingRoot"> {
  return { output: "standalone", outputFileTracingRoot: path.join(__dirname, "..", "..") };
}
