// Which modules Next.js runs on the server first: the entries a request or the
// build starts from.

import path from "node:path";
import { hasDirective } from "./directive.mjs";

const APP_ENTRY = /^(page|layout|template|default|not-found|loading|route)\.[cm]?[jt]sx?$/;
const ROOT_ENTRY = /^(middleware|instrumentation)\.[cm]?[jt]sx?$/;

/**
 * @param {object} ctx audit context
 * @param {{ src: string }} app a configured Next app: `src` is its source root, ending in `/`
 * @returns {string[]} the app's server entries; a module opening with "use client" is not one
 */
export function serverEntries(ctx, app) {
  return ctx.scriptFiles.filter((file) => {
    if (!file.startsWith(app.src)) return false;
    const name = path.posix.basename(file);
    const inApp = file.startsWith(`${app.src}app/`) && APP_ENTRY.test(name);
    const atRoot = path.posix.dirname(file) === app.src.replace(/\/$/, "") && ROOT_ENTRY.test(name);
    if (!inApp && !atRoot && !hasDirective(ctx, file, "use server")) return false;
    return !hasDirective(ctx, file, "use client");
  });
}
