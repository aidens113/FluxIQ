// The TypeScript files tsc checks: those some tsconfig of the repository takes
// in (./tsconfigs.mjs). A file counts when a project's `files` lists it, or
// its `include` matches it and its `exclude` does not. Patterns follow tsc:
// `*` and `?` stay within one path segment, `**/` spans any number of them,
// and a pattern whose last segment has neither a wildcard nor an extension
// names a directory and everything under it. A project with neither `files`
// nor `include` takes in every file under its directory; one with `files`
// alone takes in only those. JavaScript is never counted, even under
// `allowJs`: tsc reports a broken import from it only under `checkJs`.

import path from "node:path";

const TYPESCRIPT = /\.(ts|tsx|mts|cts)$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const DEFAULT_EXCLUDE = ["node_modules", "bower_components", "jspm_packages"];

/**
 * @param {string[]} scriptFiles POSIX, relative to this repository
 * @param {import("./tsconfigs.mjs").Tsconfig[]} configs
 * @returns {Set<string>}
 */
export function typeCheckedFiles(scriptFiles, configs) {
  const candidates = scriptFiles.filter((file) => TYPESCRIPT.test(file) && !DECLARATION.test(file));
  const checked = new Set();
  for (const config of configs) {
    const directory = path.posix.dirname(config.file);
    const listed = new Set((config.files ?? []).map(({ pattern, base }) => path.posix.normalize(path.posix.join(base, pattern))));
    const include = config.include ?? (config.files ? [] : [{ pattern: "**/*", base: directory }]);
    const exclude = config.exclude ?? [
      ...DEFAULT_EXCLUDE.map((pattern) => ({ pattern, base: directory })),
      ...(config.outDir ? [{ pattern: config.outDir, base: "." }] : [])
    ];
    const includes = include.map(matcher);
    const excludes = exclude.map(matcher);
    for (const file of candidates) {
      if (listed.has(file) || (includes.some((test) => test(file)) && !excludes.some((test) => test(file)))) checked.add(file);
    }
  }
  return checked;
}

function matcher({ pattern, base }) {
  const segments = path.posix.normalize(path.posix.join(base, pattern)).replace(/\/$/, "").split("/");
  const last = segments.at(-1);
  if (!/[*?]/.test(last) && !last.includes(".")) segments.push("**", "*");
  const source = segments.map((segment, index) => {
    const end = index === segments.length - 1;
    if (segment === "**") return end ? ".*" : "(?:[^/]+/)*";
    const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*").replaceAll("?", "[^/]");
    return end ? escaped : `${escaped}/`;
  }).join("");
  const expression = new RegExp(`^${source}$`);
  return (file) => expression.test(file);
}
