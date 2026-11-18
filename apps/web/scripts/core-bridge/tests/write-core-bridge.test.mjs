import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CORE_BRIDGE_PACKAGE, writeCoreBridge } from "../index.mjs";

const run = promisify(execFile);

// A workspace like Core's: apps/web links packages/fluxiq, as pnpm links a workspace package.
let root;
let web;
let core;

async function write(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

beforeEach(async () => {
  root = realpathSync(await mkdtemp(path.join(os.tmpdir(), "core-bridge-")));
  web = path.join(root, "apps", "web");
  core = path.join(root, "packages", "fluxiq");
  await write(path.join(core, "package.json"), JSON.stringify({
    name: "fluxiq",
    version: "9.9.9",
    type: "module",
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./automation": { types: "./dist/automation/index.d.ts", import: "./dist/automation/index.js" },
      "./automation/nodes": { import: "./dist/automation/nodes/index.js" },
      "./package.json": "./package.json"
    }
  }));
  await write(path.join(core, "dist", "hub.js"), "export const hub = { made: Symbol(\"hub\") };\n");
  await write(path.join(core, "dist", "index.js"), "export { hub } from \"./hub.js\";\nexport const top = 1;\n");
  await write(path.join(core, "dist", "automation", "index.js"), "export { hub as automationHub } from \"../hub.js\";\n");
  await write(path.join(core, "dist", "automation", "nodes", "index.js"), "export { hub as nodesHub } from \"../../hub.js\";\n");
  await mkdir(path.join(web, "node_modules"), { recursive: true });
  await symlink(core, path.join(web, "node_modules", "fluxiq"), "junction");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("writeCoreBridge", () => {
  it("writes the bridge at the workspace root, where apps/web, every package and the server's chunks all resolve it", () => {
    expect(writeCoreBridge(web)).toEqual({
      name: CORE_BRIDGE_PACKAGE,
      directory: path.join(root, "node_modules", CORE_BRIDGE_PACKAGE),
      aliases: {
        fluxiq: CORE_BRIDGE_PACKAGE,
        "fluxiq/automation": `${CORE_BRIDGE_PACKAGE}/automation`,
        "fluxiq/automation/nodes": `${CORE_BRIDGE_PACKAGE}/automation/nodes`
      }
    });
  });

  it("re-exports Core's real files, so every entry point and a direct import of Core share one module state", async () => {
    const { directory } = writeCoreBridge(web);
    const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    expect(manifest).toMatchObject({ name: CORE_BRIDGE_PACKAGE, version: "9.9.9", type: "module", sideEffects: false, exports: { ".": "./index.js", "./automation": "./automation.js", "./automation/nodes": "./automation/nodes.js" } });
    expect(await readFile(path.join(directory, "automation", "nodes.js"), "utf8")).toContain('export * from "../../../packages/fluxiq/dist/automation/nodes/index.js";');
    // Node's own loader decides module identity (Vitest's does not), so a plain `node` process imports
    // the bridge's entries beside `fluxiq` as another Node importer (the extension's host module) reaches it.
    const probe = path.join(web, "identity-probe.mjs");
    await write(path.join(web, "package.json"), JSON.stringify({ name: "web", type: "module" }));
    await write(probe, [
      `const bridged = await import(${JSON.stringify(pathToFileURL(path.join(directory, "index.js")).href)});`,
      `const automation = await import(${JSON.stringify(pathToFileURL(path.join(directory, "automation.js")).href)});`,
      `const nodes = await import(${JSON.stringify(pathToFileURL(path.join(directory, "automation", "nodes.js")).href)});`,
      'const linked = await import("fluxiq");',
      "console.log(JSON.stringify({ top: bridged.top, root: bridged.hub === linked.hub, automation: automation.automationHub === linked.hub, nodes: nodes.nodesHub === linked.hub }));"
    ].join("\n"));
    const { stdout } = await run(process.execPath, [probe], { cwd: web });
    expect(JSON.parse(stdout)).toEqual({ top: 1, root: true, automation: true, nodes: true });
  });

  it("replaces a bridge left by an older Core, dropping entries Core no longer has", async () => {
    await write(path.join(root, "node_modules", CORE_BRIDGE_PACKAGE, "gone.js"), "export {};\n");
    writeCoreBridge(web);
    await expect(readFile(path.join(root, "node_modules", CORE_BRIDGE_PACKAGE, "gone.js"), "utf8")).rejects.toThrow(/ENOENT/u);
  });

  it("refuses a Core package without exports", async () => {
    await write(path.join(core, "package.json"), JSON.stringify({ name: "fluxiq", version: "1.0.0" }));
    expect(() => writeCoreBridge(web)).toThrow(/declares no exports/u);
  });
});
