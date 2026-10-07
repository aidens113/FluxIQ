// Every Core build and check the cache may skip, one entry per step.
//
// An entry states only what cannot be derived. The inputs are derived from it
// in `workspace/resolve-step.mjs`: the git-visible files of the package and of
// every workspace package it depends on, transitively, with each dependency's
// ignored `dist/`; every script its command runs with `node <path>`; the root
// manifests, lockfiles and `tsconfig.base.json`; the installed
// `node_modules/.pnpm/lock.yaml`; the build-cache sources; `process.version`,
// the platform, the command and the environment variables named here.
//
//   package    the package directory, relative to the repository root; "."
//              for a step of the repository itself
//   kind       "build" (has outputs, stamped on success) or "check" (no
//              outputs, stamped only when it passed)
//   inputs     "package" (the default: the derivation above) or "repository"
//              (every git-visible file of the checkout, plus the installed
//              lockfile: the structure audit reads all of them)
//   command    the shell command, run in the package directory. It must match
//              the `-- "<command>"` the package.json script passes the CLI;
//              `tests/registry.test.mjs` fails when the two drift. It may not
//              contain a double quote: package.json passes it as one quoted
//              argument through cmd.exe and sh alike. On a miss this is exactly
//              the command the package ran before the cache, so its outputs are
//              byte for byte what they were.
//   outputs    paths under the package the step writes; `exclude` leaves out
//              parts that are not the step's result (Next's own `.next/cache`),
//              `match` narrows to file names the step emits.
//   required   files under the package that must exist for a reuse.
//   tsconfigs  every TypeScript project the command compiles, relative to the
//              package: what `prove-inputs.mjs` lists and the registry test
//              parses.
//   ignoredInputs
//              ignored paths, relative to the package, the step reads anyway:
//              `{ path, match?, shallow?, name? }`, walked on disk. A
//              dependency's `dist/` is added for every step without being named.
//   env        environment variables whose value is fingerprinted (an absolute
//              path is fingerprinted relative to the repository).
//   envPrefixes
//              every environment variable whose name starts with one of these
//              is fingerprinted too.
//   traces     true when the step's outputs carry Next's `*.nft.json` file
//              traces, which `prove-inputs.mjs` holds against the inputs.
//   replayOutput
//              true when a reuse must print what the step printed when it
//              passed (the structure audit's warnings and summary).
//
// A package's `build` and `check` scripts are the steps `<dir>:build` and
// `<dir>:check`, where `<dir>` is the package's directory name.

const CACHE = "node_modules/.cache/fluxiq-build";
const LIBRARY_BUILD = "tsc -b tsconfig.build.json --clean && tsc -b tsconfig.build.json && node ../../scripts/rewrite-declaration-imports.mjs dist";
// `--incremental` keeps each file's diagnostics keyed by its version and
// re-reports them, so the set of errors is what a cold run reports; the build
// info sits under node_modules, away from the source tree and from the build's
// own `tsconfig.build.tsbuildinfo`.
const INCREMENTAL_CHECK = `tsc --noEmit --incremental --tsBuildInfoFile ${CACHE}/check.tsbuildinfo`;

function library(dir) {
  return {
    [`${dir}:build`]: {
      package: `packages/${dir}`,
      kind: "build",
      command: dir === "fluxiq" ? LIBRARY_BUILD + " && node ../../scripts/runtime-build-identity.mjs" : LIBRARY_BUILD,
      // `--clean` stays: it is what removes the output of a deleted or newly
      // excluded source. The build info is part of the result a clean build
      // leaves, so a restore leaves it too.
      outputs: [{ path: "dist" }, { path: "tsconfig.build.tsbuildinfo" }],
      required: ["dist/index.js", "dist/index.d.ts", ...(dir === "fluxiq" ? ["dist/runtime-build-identity.json"] : [])],
      ...(dir === "fluxiq" ? { ignoredInputs: [{ path: "../../scripts/runtime-build-identity", match: /\.mjs$/u }] } : {}),
      tsconfigs: ["tsconfig.build.json"],
      env: ["NODE_ENV"]
    },
    [`${dir}:check`]: {
      package: `packages/${dir}`,
      kind: "check",
      command: INCREMENTAL_CHECK,
      tsconfigs: ["tsconfig.json"],
      env: ["NODE_ENV"]
    }
  };
}

export const STEPS = Object.freeze({
  ...library("contracts"),
  ...library("fluxiq"),
  ...library("client-gateway-websocket"),
  "web:build": {
    package: "apps/web",
    kind: "build",
    command: "node scripts/build-client-gateway-server.mjs && next build --turbopack",
    // `.next/cache` is Next's own compile and fetch cache, not the build: it
    // survives a build, is never restored and never digested.
    outputs: [{ path: ".next", exclude: ["cache"] }, { path: ".server-runtime" }],
    required: [".next/BUILD_ID", ".server-runtime/client-gateway-server.mjs", ".server-runtime/client-gateway-server.mjs.identity.json"],
    // next build type-checks the app with this project.
    tsconfigs: ["tsconfig.json"],
    // Next loads apps/web/.env* into the build; all but .env.example are
    // ignored. `next.config.ts` reads no variable today; the registry test
    // fails when it starts to read one this entry does not fingerprint.
    ignoredInputs: [{ path: ".", match: /^\.env/u, shallow: true, name: ".env*" }],
    env: ["NODE_ENV"],
    envPrefixes: ["NEXT_", "__NEXT_"],
    traces: true
  },
  "web:check": {
    package: "apps/web",
    kind: "check",
    // apps/web/tsconfig.json already sets `incremental`.
    command: "tsc --noEmit",
    tsconfigs: ["tsconfig.json"],
    // tsconfig.json includes `.next/types/**/*.ts`, which next build writes.
    ignoredInputs: [{ path: ".next/types" }],
    env: ["NODE_ENV"]
  },
  "structure-audit:check": {
    package: ".",
    kind: "check",
    inputs: "repository",
    // Only the plain run is cached. `--update`, `--adopt`, `--rule` and
    // `--list` are run by their own scripts, straight through.
    command: "node scripts/structure-audit.mjs",
    tsconfigs: [],
    replayOutput: true,
    env: []
  }
});
