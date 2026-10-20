// Stages a Core checkout's web panel in an attempt directory, laid out as the
// checkout is so every relative path in it still holds:
//
//   <attempt>/tsconfig.base.json     Core's, verbatim (apps/web/tsconfig.json extends it)
//   <attempt>/packages               a link to the checkout's packages
//   <attempt>/apps/web/              a copy of apps/web without build output or dependencies
//   <attempt>/apps/web/node_modules  links into Core's installation, plus the root @types/node
//   <attempt>/apps/web/next.config.ts  the wrapper (`staged-next-config.mjs`)
//
// The copy is a snapshot: a source edited in the checkout while the build runs
// does not reach it. Core's packages are not copied; the panel's production
// build resolves them through `node_modules/fluxiq` to their built `dist`
// (`apps/web/tsconfig.build.json`), which the caller's fingerprint covers.
//
// The `packages` link is not optional. Without it Turbopack's build worker
// died with an access violation (exit 3221225477) seconds into every staged
// build, and with it the same attempt built and embedded the stamped identity
// (measured 2026-10-19, four builds of one attempt varying one thing at a
// time): the source aliases in tsconfig.json and the base still name
// `packages/<name>/src`, and something in Turbopack reads them even when the
// build resolves through tsconfig.build.json.

import { access, copyFile, cp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { webBuildError } from "../web-build-error.mjs";
import { isCopiedWebEntry } from "./copied-web-entry.mjs";
import { mirrorNodeModules } from "./mirror-node-modules.mjs";
import { stagedNextConfig } from "./staged-next-config.mjs";

const LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

/**
 * @param {string} repoRoot the Core checkout
 * @param {string} attemptDirectory an empty directory the build owns
 * @returns {Promise<{ webDirectory: string }>}
 */
export async function stageWorkspace(repoRoot, attemptDirectory) {
  const source = path.join(repoRoot, "apps", "web");
  const sourceNodeModules = path.join(source, "node_modules");
  const rootNodeTypes = path.join(repoRoot, "node_modules", "@types", "node");
  const tsconfigBase = path.join(repoRoot, "tsconfig.base.json");
  await requirePaths([sourceNodeModules, rootNodeTypes, tsconfigBase, path.join(repoRoot, "packages"), path.join(source, "next.config.ts")]);
  const webDirectory = path.join(attemptDirectory, "apps", "web");
  await cp(source, webDirectory, { recursive: true, force: false, errorOnExist: true, filter: (candidate) => isCopiedWebEntry(path.basename(candidate)) });
  await copyFile(path.join(source, "next.config.ts"), path.join(webDirectory, "next.config.core.ts"));
  await writeFile(path.join(webDirectory, "next.config.ts"), stagedNextConfig(repoRoot), "utf8");
  const targetNodeModules = path.join(webDirectory, "node_modules");
  await mirrorNodeModules(sourceNodeModules, targetNodeModules);
  await mkdir(path.join(targetNodeModules, "@types"), { recursive: true });
  await symlink(await realpath(rootNodeTypes), path.join(targetNodeModules, "@types", "node"), LINK_TYPE).catch((error) => {
    // apps/web may install @types/node itself; then the mirror already holds it.
    if (error?.code !== "EEXIST") throw error;
  });
  await copyFile(tsconfigBase, path.join(attemptDirectory, "tsconfig.base.json"));
  await symlink(path.join(repoRoot, "packages"), path.join(attemptDirectory, "packages"), LINK_TYPE);
  return { webDirectory };
}

async function requirePaths(targets) {
  for (const target of targets) {
    try {
      await access(target);
    } catch (cause) {
      throw webBuildError("environment", `A staged web build needs ${target}, which is missing: install Core's dependencies (pnpm install) in that checkout.`, { path: target }, cause);
    }
  }
}
