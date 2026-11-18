// What each of Core's built modules exports, as a signature a bundled copy of
// it can be recognised by.
//
// A production server chunk names its modules by number, and Turbopack's maps
// list no sources for modules compiled from Core's `dist`, but every module
// still registers its exports by name (`e.s(["name", () => local, ...], id)`).
// The sorted list of names a module exports is its signature. Only names
// carried by exactly one Core module, other than a bare `default`, are kept,
// so a signature names one module.
//
// This module is loaded by `next.config.ts`, which Next compiles to CommonJS,
// so it uses neither top-level await nor `import.meta`.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DECLARED = /^export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gmu;
const LISTED = /^export\s*\{([^}]*)\}/gmu;
const STAR = /^export\s*\*/mu;

/**
 * @param {string} coreDirectory the `fluxiq` package directory, holding `dist`
 * @returns {Promise<Map<string, string>>} signature (names sorted, joined by ",") to the module's path inside the package
 */
export async function coreExportSignatures(coreDirectory) {
  const distDirectory = path.join(coreDirectory, "dist");
  const files = await builtJavaScript(distDirectory);
  if (files.length === 0) throw new Error(`One Core graph: Core's build is missing (${distDirectory} holds no JavaScript), so its modules cannot be recognised. Build Core's libraries first.`);
  /** @type {Map<string, string | null>} */
  const found = new Map();
  for (const file of files) {
    const names = moduleExportNames(await readFile(path.join(distDirectory, file), "utf8"));
    if (names === null || names.length === 0 || (names.length === 1 && names[0] === "default")) continue;
    const signature = names.join(",");
    found.set(signature, found.has(signature) ? null : `dist/${file}`);
  }
  /** @type {Map<string, string>} */
  const signatures = new Map();
  for (const [signature, module] of found) if (module !== null) signatures.set(signature, module);
  return signatures;
}

/** The sorted names an ES module exports, or null when `export *` hides some. */
function moduleExportNames(code) {
  if (STAR.test(code)) return null;
  const names = new Set();
  for (const match of code.matchAll(DECLARED)) names.add(/^export\s+default\b/u.test(match[0]) ? "default" : match[1]);
  if (/^export\s+default\b/mu.test(code)) names.add("default");
  for (const match of code.matchAll(LISTED)) {
    for (const part of match[1].split(",")) {
      const words = part.trim().split(/\s+as\s+/u);
      const name = (words[1] ?? words[0] ?? "").trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

async function builtJavaScript(directory, root = directory) {
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
      if (entry.isDirectory()) return builtJavaScript(target, root);
      return entry.isFile() && entry.name.endsWith(".js") ? [path.relative(root, target).split(path.sep).join("/")] : [];
    })
  );
  return nested.flat();
}
