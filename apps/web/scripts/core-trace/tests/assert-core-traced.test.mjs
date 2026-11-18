import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertCoreTraced, coreRequests } from "../index.mjs";

// A workspace like Core's: apps/web links packages/fluxiq; the build's server sits in apps/web/.next/server.
let root;
let web;
let core;
let dist;
let server;

async function write(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** An `.nft.json` beside `entry` naming `files` (absolute), relative to itself, as Next writes them. */
async function trace(entry, files) {
  const at = path.join(server, `${entry}.nft.json`);
  await write(at, JSON.stringify({ version: 1, files: files.map((file) => path.relative(path.dirname(at), file).split(path.sep).join("/")) }));
}

const link = () => path.join(web, "node_modules", "fluxiq");
const manifest = () => path.join(core, "package.json");
const target = (file) => path.join(core, "dist", file);

beforeEach(async () => {
  root = realpathSync(await mkdtemp(path.join(os.tmpdir(), "core-trace-")));
  web = path.join(root, "apps", "web");
  core = path.join(root, "packages", "fluxiq");
  dist = path.join(web, ".next");
  server = path.join(dist, "server");
  await write(manifest(), JSON.stringify({ name: "fluxiq", type: "module", exports: { ".": { import: "./dist/index.js" }, "./server": { types: "./dist/server/index.d.ts", import: "./dist/server/index.js" } } }));
  await mkdir(path.join(web, "node_modules"), { recursive: true });
  await symlink(core, link(), "junction");
  await write(path.join(server, "instrumentation.js"), 'module.exports=[1,e=>{"use strict";e.y("fluxiq")}];');
  await write(path.join(server, "chunks", "route._.js"), 'module.exports=[2,e=>{"use strict";e.y("fluxiq/server");e.x("node:path")}];');
  await write(path.join(server, "edge", "chunks", "middleware._.js"), 'e.y("fluxiq/platform/profile")');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("assertCoreTraced", () => {
  it("passes when the traces carry the link, Core's package.json and every requested entry's built file", async () => {
    await trace("instrumentation.js", [link(), manifest(), target("index.js")]);
    await trace("chunks/route._.js", [link(), manifest(), target("server/index.js")]);
    await expect(assertCoreTraced({ distDirectory: dist, webDirectory: web })).resolves.toEqual({ requests: 2, traced: 4 });
  });

  it("refuses traces that miss a requested entry's file, naming the request and its importer", async () => {
    await trace("instrumentation.js", [link(), manifest(), target("index.js")]);
    await expect(assertCoreTraced({ distDirectory: dist, webDirectory: web })).rejects.toThrow(/lack 1 file\(s\)[\s\S]*fluxiq\/server -> .*server[\\/]index\.js \(imported by chunks\/route\._\.js\)/u);
  });

  it("refuses traces without the link or Core's package.json, which Node needs to resolve any request", async () => {
    await trace("instrumentation.js", [target("index.js"), target("server/index.js")]);
    await expect(assertCoreTraced({ distDirectory: dist, webDirectory: web })).rejects.toThrow(/lack 2 file\(s\)[\s\S]*the link[\s\S]*package\.json/u);
  });

  it("counts the gateway's native server, whose requests the traces must carry too", async () => {
    const gateway = path.join(web, ".server-runtime", "client-gateway-server.mjs");
    await write(gateway, 'import { a } from "fluxiq/server";\nconst b = await import("fluxiq/automation");\n');
    await trace("instrumentation.js", [link(), manifest(), target("index.js"), target("server/index.js")]);
    await expect(assertCoreTraced({ distDirectory: dist, webDirectory: web, modules: [gateway] })).rejects.toThrow(/fluxiq\/automation \(imported by .*client-gateway-server\.mjs\): Core's package\.json exports no file for it/u);
  });

  it("refuses a server that imports no Core through Node (Core bundled), and one with no traces", async () => {
    await write(path.join(server, "instrumentation.js"), "module.exports=[];");
    await write(path.join(server, "chunks", "route._.js"), "module.exports=[];");
    await expect(assertCoreTraced({ distDirectory: dist, webDirectory: web })).rejects.toThrow(/imports fluxiq through Node, so Core is bundled or missing/u);
    await write(path.join(server, "chunks", "route._.js"), 'e.y("fluxiq/server")');
    await expect(assertCoreTraced({ distDirectory: dist, webDirectory: web })).rejects.toThrow(/wrote no Node server traces/u);
  });
});

describe("coreRequests", () => {
  it("reads Core requests from Node chunks and named modules, ignoring edge output and a missing module", async () => {
    const requests = await coreRequests(server, [path.join(web, "absent.mjs")]);
    expect(Object.fromEntries(requests)).toEqual({ fluxiq: ["instrumentation.js"], "fluxiq/server": ["chunks/route._.js"] });
  });
});
