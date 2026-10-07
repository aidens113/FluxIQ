import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The web tests import `fluxiq` through its package exports, which resolve to
// the COMPILED `packages/fluxiq/dist` (and through it `packages/contracts/dist`).
// A dist older than its source makes them pass or fail on the old Core: on
// 2026-10-02 two conversation tests failed on a stale dist and passed after a
// rebuild. So a stale or missing build is refused here, naming the command.
// It is not rebuilt here: the Core beside a task worktree is shared by every
// sibling task and running Lab, and a rebuild deletes modules under them.
const coreRoot = fileURLToPath(new URL("../..", import.meta.url));
const LIBRARIES = ["contracts", "fluxiq"];
const REBUILD = `pnpm ${LIBRARIES.map((name) => `--filter ${name === "fluxiq" ? name : `@fluxiq/${name}`}`).join(" ")} build`;

type Newest = { ms: number; file: string | null };

function newestFile(directory: string, found: Newest, shipped: (name: string) => boolean): Newest {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "tests" && entry.name !== "node_modules") newestFile(target, found, shipped);
    } else if (entry.isFile() && shipped(entry.name)) {
      const ms = statSync(target).mtimeMs;
      if (ms > found.ms) Object.assign(found, { ms, file: target });
    }
  }
  return found;
}

function refuseStaleCoreBuild(): void {
  const isTest = (name: string) => /\.test\.[cm]?[jt]sx?$/u.test(name);
  const source: Newest = { ms: 0, file: null };
  const built: Newest = { ms: 0, file: null };
  for (const library of LIBRARIES) {
    const root = path.join(coreRoot, "packages", library);
    newestFile(path.join(root, "src"), source, (name) => !isTest(name));
    const output = newestFile(path.join(root, "dist"), { ms: 0, file: null }, () => true);
    if (output.file === null) throw new Error(`apps/web tests: packages/${library}/dist is missing, and the web tests import it. Build Core's libraries first: ${REBUILD} (in ${coreRoot}).`);
    if (output.ms > built.ms) Object.assign(built, output);
  }
  if (source.ms > built.ms) {
    const minutes = Math.round((source.ms - built.ms) / 60_000);
    throw new Error([
      `apps/web tests: Core's library build is ${minutes === 0 ? "less than a minute" : `${minutes} minute(s)`} behind its source.`,
      `  Stale: ${source.file} is newer than anything in dist (newest built file: ${built.file}).`,
      "  The web tests import the COMPILED dist, so they would pass or fail on the old Core.",
      `  Rebuild, then run the tests again: ${REBUILD} (in ${coreRoot}).`
    ].join("\n"));
  }
}

refuseStaleCoreBuild();

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"]
  }
});
