// A Next.js server entry never reaches, through value imports, a module that
// needs the client but has no "use client" directive.
//
// Why. `next build` compiles every route as a server module graph and refuses
// a hook or createContext call in a module that no "use client" boundary
// covers; `next dev` compiles a page only when it is visited, so the fault
// shows first in a build. In t915 a server route imported the Chats feature
// barrel, whose plain load-chats.ts pulled the automation-studio conversation
// barrel and with it two modules calling React hooks without the directive.
//
// What is measured. CONFIG.nextApps, each { name, src }: `src` is a Next app's
// source root (a path ending in `/`), which `@/` names. Its server entries are
// the app/ modules named page, layout, template, default, not-found, loading
// or route, the root middleware and instrumentation, and any module opening
// with "use server"; one opening with "use client" is no server entry. From
// them the walk follows static value imports and re-exports (type-only ones
// carry no value) through relative paths, `@/` and barrels, and stops at a
// module opening with "use client", which is the boundary. A reached module
// that calls a hook (`useX`, `React.useX`) or createContext fails, never
// ratcheted, with the shortest chain from a server entry. Workspace packages
// and node_modules are not followed, and neither are dynamic imports. A
// repository without nextApps, such as the web extension, passes untouched.

import { clientApiCalls, hasDirective, resolveLocal, serverEntries, valueImports } from "../client-boundary/index.mjs";

export const id = "server-client-boundary";
export const title = "Next.js server entries never reach a client-only module without \"use client\"";

export function run(ctx) {
  const findings = [];
  const fileSet = new Set(ctx.scriptFiles);
  for (const app of ctx.CONFIG.nextApps ?? []) {
    const parents = new Map();
    const queue = [];
    for (const entry of serverEntries(ctx, app)) {
      parents.set(entry, null);
      queue.push(entry);
    }
    for (let head = 0; head < queue.length; head += 1) {
      const file = queue[head];
      const calls = clientApiCalls(ctx, file);
      if (calls.length > 0) {
        const chain = [];
        for (let step = file; step !== null; step = parents.get(step)) chain.unshift(step);
        const shown = chain.map((step, index) => `${index === 0 ? "   " : "-> "}${step}`).join("\n    ");
        const apis = calls.map((call) => `${call.name} (line ${call.line})`).join(", ");
        findings.push({
          key: `${app.name}::${file}`, value: 1, limit: 0, path: file, line: calls[0].line,
          message: `${file}: calls ${apis}, which needs the client, yet "${app.name}" loads it on the server and it has no "use client" directive. The chain from a server entry:\n    ${shown}\n  Add "use client" to ${file} if it is a client module, or cut the import above it that drags it into the server graph (import the server-safe module directly, not a barrel that also re-exports it).`,
          severity: "fail", ratchet: false
        });
      }
      for (const specifier of valueImports(ctx, file)) {
        const target = resolveLocal(fileSet, file, specifier, app.src);
        if (target === null || parents.has(target) || hasDirective(ctx, target, "use client")) continue;
        parents.set(target, file);
        queue.push(target);
      }
    }
  }
  return findings;
}
