// Whether a package's manifest lets an importer load one subpath, as Node's
// `exports` resolution answers it: an exact key, or a `*` pattern key, whose
// target is not `null`. A package with no `exports` field leaves every subpath
// open, as Node does; one whose `exports` is a string or a condition object
// exports its root alone.

/**
 * @param {Record<string, any>} manifest
 * @param {string} subpath the specifier after the package name: "" or "/a/b"
 * @returns {boolean}
 */
export function isExportedSubpath(manifest, subpath) {
  const { exports } = manifest;
  const key = subpath === "" ? "." : `.${subpath}`;
  if (exports === undefined) return true;
  if (exports === null) return false;
  if (typeof exports === "string" || Array.isArray(exports)) return key === ".";
  const keys = Object.keys(exports);
  if (!keys.some((candidate) => candidate.startsWith("."))) return key === "." && open(exports);
  if (Object.hasOwn(exports, key)) return open(exports[key]);
  const pattern = keys
    .filter((candidate) => candidate.includes("*") && matches(candidate, key))
    .sort((a, b) => b.length - a.length)[0];
  return pattern !== undefined && open(exports[pattern]);
}

function matches(pattern, key) {
  const star = pattern.indexOf("*");
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return key.length >= prefix.length + suffix.length && key.startsWith(prefix) && key.endsWith(suffix);
}

// A target is open unless it is `null`, or a condition object every branch of
// which is closed.
function open(target) {
  if (target === null) return false;
  if (typeof target === "string") return true;
  if (Array.isArray(target)) return target.some(open);
  if (typeof target === "object") return Object.values(target).some(open);
  return false;
}
