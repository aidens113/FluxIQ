// Which copies of Core's modules a panel build's Node server holds.
//
// Turbopack writes each server chunk as `module.exports = [id, ..., factory,
// ...]`, and a factory registers each module's exports by name:
// `e.s(["name", () => local, ...], id)`, the id left out for the factory's own
// module. A copy is one module id under one Turbopack runtime: the chunks
// beside `chunks/[turbopack]_runtime.js` (instrumentation and route handlers)
// share one module cache, and those under `chunks/ssr/` (pages) have their
// own. One id in several chunks of one runtime is evaluated once; the same
// Core module under two ids, or under two runtimes, is evaluated twice, and
// so is its module-level state.
//
// Edge output (`server/edge/`) is left out: middleware runs in its own
// isolate, never in the Node graph that routes and instrumentation share.
//
// This module is loaded by `next.config.ts`, which Next compiles to CommonJS,
// so it uses neither top-level await nor `import.meta`.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Next's manifests are plain data files written as JavaScript, without modules. */
const MANIFEST = /manifest\.js$/u;
/** A factory's start: the ids it serves, then `e => { "use strict"`. */
const FACTORY = /(?<=[[,])(\d+)(?:,\d+)*,[A-Za-z_$][\w$]*=>\{"use strict"/gu;
/** One export registration: the names with their getters, then the module id when it is not the factory's own. */
const REGISTRATION = /\b[A-Za-z_$][\w$]*\.s\(\[((?:"[^"\\]*",\(\)=>[^,\]]*,?)*)\](?:,(\d+))?\)/gu;
const NAME = /"([^"\\]*)",\(\)=>/gu;

/**
 * @param {string} serverDirectory a build's `.next/server`
 * @param {Map<string, string>} signatures from `coreExportSignatures`
 * @returns {Promise<{ files: number, registrations: number, copies: Map<string, Map<string, string[]>> }>}
 *   `copies` maps each Core module found to its copies (`<runtime>:<module id>`)
 *   and the chunks holding each; `registrations` counts every export
 *   registration read, Core's or not, so a chunk format this cannot read shows
 *   as none at all.
 */
export async function coreModuleCopies(serverDirectory, signatures) {
  const files = (await serverJavaScript(serverDirectory, serverDirectory)).filter((file) => !MANIFEST.test(file));
  /** @type {Map<string, Map<string, string[]>>} */
  const copies = new Map();
  let registrations = 0;
  for (const file of files) {
    const code = await readFile(path.join(serverDirectory, file), "utf8");
    const runtime = path.posix.dirname(file);
    const factories = [...code.matchAll(FACTORY)].map((match) => ({ at: match.index, id: match[1] }));
    for (const match of code.matchAll(REGISTRATION)) {
      const names = [...match[1].matchAll(NAME)].map((name) => name[1]);
      if (names.length === 0) continue;
      registrations += 1;
      const module = signatures.get([...new Set(names)].sort().join(","));
      if (module === undefined) continue;
      const id = match[2] ?? owningFactory(factories, match.index);
      const copy = `${runtime}:${id ?? `${file}@${match.index}`}`;
      const held = copies.get(module) ?? new Map();
      const chunks = held.get(copy) ?? [];
      if (!chunks.includes(file)) chunks.push(file);
      held.set(copy, chunks);
      copies.set(module, held);
    }
  }
  return { files: files.length, registrations, copies };
}

/** The id of the last factory that starts before `at`. */
function owningFactory(factories, at) {
  let found;
  for (const factory of factories) {
    if (factory.at > at) break;
    found = factory.id;
  }
  return found;
}

async function serverJavaScript(directory, root) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      const shown = path.relative(root, target).split(path.sep).join("/");
      if (entry.isDirectory()) return shown === "edge" ? [] : serverJavaScript(target, root);
      return entry.isFile() && entry.name.endsWith(".js") ? [shown] : [];
    })
  );
  return nested.flat().sort();
}
