// Which entries of `apps/web`, at any depth, a staged build copies: all but
// build output, installed dependencies, test reports, and Core's own
// `next.config.ts`, which the staged build wraps (`staged-next-config.mjs`).

const EXCLUDED = new Set([".next", "node_modules", "playwright-report", "test-results", "next.config.ts"]);

/** @param {string} name an entry's base name @returns {boolean} */
export function isCopiedWebEntry(name) {
  return !EXCLUDED.has(name);
}
