// A staged web build: a snapshot copy of apps/web laid out as the checkout
// is, the installation linked rather than copied, and Core's own config
// wrapped with nothing but a Turbopack root.

import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isCopiedWebEntry, stagedNextConfig, stageWorkspace } from "../index.mjs";

async function write(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function scratchCore(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-build-staging-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const core = path.join(root, "core");
  const files = {
    "tsconfig.base.json": '{ "compilerOptions": { "paths": { "fluxiq": ["packages/fluxiq/src/index.ts"] } } }\n',
    "apps/web/next.config.ts": "export default function nextConfig() { return {}; }\n",
    "apps/web/tsconfig.json": '{ "extends": "../../tsconfig.base.json" }\n',
    "apps/web/tsconfig.build.json": "{}\n",
    "apps/web/src/app/page.tsx": "export default function Page() { return null; }\n",
    "apps/web/.server-runtime/client-gateway-server.mjs": "export {};\n",
    "apps/web/.next/BUILD_ID": "in-place\n",
    "apps/web/test-results/report.txt": "x\n",
    "apps/web/node_modules/next/package.json": "{}\n",
    "apps/web/node_modules/@xyflow/react/package.json": "{}\n",
    "node_modules/@types/node/package.json": "{}\n",
    "packages/fluxiq/package.json": "{}\n"
  };
  for (const [relative, text] of Object.entries(files)) await write(path.join(core, ...relative.split("/")), text);
  return { root, core };
}

test("only build output, dependencies, reports and Core's own config are left out of the copy", () => {
  for (const name of [".next", "node_modules", "playwright-report", "test-results", "next.config.ts"]) assert.equal(isCopiedWebEntry(name), false, name);
  for (const name of ["src", ".server-runtime", "tsconfig.build.json", ".env.local", "package.json"]) assert.equal(isCopiedWebEntry(name), true, name);
});

test("the wrapper calls Core's own config and adds only the Turbopack root of the checkout's filesystem", () => {
  const text = stagedNextConfig(path.resolve("/some/where/core"));
  assert.match(text, /import core from "\.\/next\.config\.core\.ts";/u);
  assert.ok(text.includes(`root: ${JSON.stringify(path.parse(path.resolve("/")).root)}`), text);
  assert.match(text, /typeof declared === "function" \? await declared\(phase, context\) : declared/u);
});

test("staging lays the attempt out as the checkout is, links the installation and wraps the config", async (t) => {
  const { root, core } = await scratchCore(t);
  const attempt = path.join(root, "cache", "key", "b-0123456789ab");
  await mkdir(attempt, { recursive: true });
  const { webDirectory } = await stageWorkspace(core, attempt);
  assert.equal(webDirectory, path.join(attempt, "apps", "web"));
  assert.equal(await readFile(path.join(attempt, "tsconfig.base.json"), "utf8"), await readFile(path.join(core, "tsconfig.base.json"), "utf8"), "Core's base config, verbatim");
  assert.equal(await readFile(path.join(webDirectory, "next.config.core.ts"), "utf8"), await readFile(path.join(core, "apps/web/next.config.ts"), "utf8"));
  assert.equal(await readFile(path.join(webDirectory, "next.config.ts"), "utf8"), stagedNextConfig(core));
  for (const kept of ["src/app/page.tsx", "tsconfig.build.json", ".server-runtime/client-gateway-server.mjs"]) await stat(path.join(webDirectory, kept));
  for (const left of [".next", "test-results"]) await assert.rejects(stat(path.join(webDirectory, left)), { code: "ENOENT" }, left);
  for (const linked of ["next", "@xyflow/react", "@types/node"]) {
    const target = path.join(webDirectory, "node_modules", ...linked.split("/"));
    assert.equal((await lstat(target)).isSymbolicLink(), true, `${linked} is a link`);
  }
  assert.equal(await realpath(path.join(webDirectory, "node_modules", "next")), await realpath(path.join(core, "apps/web/node_modules/next")));
  assert.equal(await realpath(path.join(webDirectory, "node_modules", "@types", "node")), await realpath(path.join(core, "node_modules/@types/node")));
  assert.equal((await lstat(path.join(attempt, "packages"))).isSymbolicLink(), true, "packages is linked, not copied");
  assert.equal(await realpath(path.join(attempt, "packages")), await realpath(path.join(core, "packages")));
});

test("a checkout without its installation is refused with what to do", async (t) => {
  const { root, core } = await scratchCore(t);
  await rm(path.join(core, "apps/web/node_modules"), { recursive: true });
  const attempt = path.join(root, "attempt");
  await mkdir(attempt);
  await assert.rejects(stageWorkspace(core, attempt), /needs .*node_modules, which is missing: install Core's dependencies/u);
});
