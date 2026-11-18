import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertOneCoreGraph, coreExportSignatures } from "../index.mjs";

let root;
let distDirectory;
let coreDirectory;

async function write(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** A built Core: the hub, IAM's change listeners, a barrel and two modules a signature cannot name alone. */
async function core() {
  await write(path.join(coreDirectory, "dist/runtime/activity/default-hub.js"), 'import { AutomationStudioActivityHub } from "./hub.js";\nexport const automationStudioActivityHub = new AutomationStudioActivityHub();\n');
  await write(path.join(coreDirectory, "dist/platform/iam/announced-changes.js"), "const listeners = new Set();\nexport const iamStoreChanges = Object.freeze({});\nexport function announceIamStoreChange() {}\n");
  await write(path.join(coreDirectory, "dist/runtime/activity/index.js"), 'export { automationStudioActivityHub } from "./default-hub.js";\nexport * from "./emit.js";\n');
  await write(path.join(coreDirectory, "dist/a/same.js"), "export function shared() {}\n");
  await write(path.join(coreDirectory, "dist/b/same.js"), "export function shared() {}\n");
  await write(path.join(coreDirectory, "dist/c/default.js"), "export default function () {}\n");
}

/** A Turbopack server chunk: `[id, ..., factory]` entries whose factories register exports. */
async function chunk(file, entries) {
  const body = entries.map(({ ids, registers }) => `${ids.join(",")},e=>{"use strict";${registers.map(({ names, id }) => `e.s([${names.map((name, index) => `"${name}",()=>v${index}`).join(",")}]${id === undefined ? "" : `,${id}`})`).join(";")}}`).join(",");
  await write(path.join(distDirectory, "server", file), `module.exports=[${body}];`);
}

const HUB = { names: ["automationStudioActivityHub"] };
const APP = { names: ["getFluxIQ"] };

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "one-core-graph-"));
  distDirectory = path.join(root, ".next");
  coreDirectory = path.join(root, "core");
  await core();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("assertOneCoreGraph", () => {
  it("refuses Core bundled under two module ids, as instrumentation and a route held it, naming both copies", async () => {
    await chunk("chunks/packages_instrumentation._.js", [{ ids: [11], registers: [{ ...HUB, id: 307292 }] }]);
    await chunk("chunks/packages_route._.js", [{ ids: [12], registers: [{ ...HUB, id: 318516 }, APP] }]);
    await expect(assertOneCoreGraph({ distDirectory, coreDirectory })).rejects.toThrow(
      /1 Core module\(s\) are bundled more than once[\s\S]*fluxiq\/dist\/runtime\/activity\/default-hub\.js: 2 copies, chunks:307292 \(chunks\/packages_instrumentation\._\.js\); chunks:318516 \(chunks\/packages_route\._\.js\)[\s\S]*serverExternalPackages/u
    );
  });

  it("refuses one module id under the pages' own runtime as a second copy", async () => {
    await chunk("chunks/packages_a._.js", [{ ids: [5, 6], registers: [{ names: ["iamStoreChanges", "announceIamStoreChange"] }] }]);
    await chunk("chunks/ssr/packages_a._.js", [{ ids: [5, 6], registers: [{ names: ["announceIamStoreChange", "iamStoreChanges"] }] }]);
    await expect(assertOneCoreGraph({ distDirectory, coreDirectory })).rejects.toThrow(/announced-changes\.js: 2 copies, chunks:5 [\s\S]*chunks\/ssr:5 /u);
  });

  it("passes one module id in several chunks of one runtime, which that runtime evaluates once", async () => {
    await chunk("chunks/packages_a._.js", [{ ids: [318516], registers: [HUB] }]);
    await chunk("chunks/packages_b._.js", [{ ids: [1], registers: [APP] }, { ids: [318516], registers: [HUB] }]);
    await expect(assertOneCoreGraph({ distDirectory, coreDirectory })).resolves.toEqual({ files: 2, bundled: 1 });
  });

  it("passes a build that loads Core from Node, bundling none of it, and reads past manifests and middleware's edge isolate", async () => {
    await chunk("instrumentation.js", [{ ids: [1], registers: [APP] }]);
    await chunk("chunks/apps_web._.js", [{ ids: [2], registers: [APP] }]);
    await chunk("chunks/ssr/apps_web._.js", [{ ids: [2], registers: [APP] }]);
    await chunk("edge/chunks/middleware._.js", [{ ids: [3], registers: [{ ...HUB, id: 3 }] }, { ids: [4], registers: [{ ...HUB, id: 4 }] }]);
    await write(path.join(distDirectory, "server/app/page_client-reference-manifest.js"), "globalThis.__RSC_MANIFEST={};");
    await expect(assertOneCoreGraph({ distDirectory, coreDirectory })).resolves.toEqual({ files: 3, bundled: 0 });
  });

  it("refuses output it cannot read rather than passing it", async () => {
    await write(path.join(distDirectory, "server/chunks/webpack-style.js"), "exports.modules={1:function(m){m.exports.automationStudioActivityHub={}}};");
    await expect(assertOneCoreGraph({ distDirectory, coreDirectory })).rejects.toThrow(/none of the 1 Node server files registers a module export/u);
  });

  it("refuses a build with no server output, and a Core without its build", async () => {
    await expect(assertOneCoreGraph({ distDirectory, coreDirectory })).rejects.toThrow(/no Node server JavaScript/u);
    await chunk("chunks/a._.js", [{ ids: [1], registers: [APP] }]);
    await expect(assertOneCoreGraph({ distDirectory, coreDirectory: path.join(root, "missing") })).rejects.toThrow(/Core's build is missing/u);
  });
});

describe("coreExportSignatures", () => {
  it("names a module by the exports only it has, and skips star barrels, shared signatures and a bare default", async () => {
    expect(Object.fromEntries(await coreExportSignatures(coreDirectory))).toEqual({
      automationStudioActivityHub: "dist/runtime/activity/default-hub.js",
      "announceIamStoreChange,iamStoreChanges": "dist/platform/iam/announced-changes.js"
    });
  });
});
