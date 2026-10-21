// Configured modules never reach configured others, directly or through any
// chain of imports.
//
// Why. Some separations are not about one import but about what a module can
// get at. The first one configured: the modules that build what a model reads
// (prompts, tool descriptions, catalogue and script-format text) must never
// reach the modules holding recorded traces. A trace holds what one site
// showed during one build; once it can flow into guidance, the guidance can
// start describing a test site, and a Lab pass stops meaning the product
// generalises. An importBoundaries entry (imports.mjs) bans one directory's
// direct imports; content arrives just as well through three modules in
// between, so this rule follows every chain.
//
// What is measured. CONFIG.reachBoundaries, each { name, from, to, reason,
// remedy }: `from` and `to` are path prefixes (a prefix ending in `/` is a
// directory, any other names one file). Every non-test script under `from` is
// walked binding by binding (../import-graph/binding-reach.mjs): an import of
// `{ a }` from a barrel leads to the module declaring `a` and the re-exports
// carrying it, not to everything else the barrel re-exports, because through
// the barrels nearly every module loads nearly every other. Namespace imports
// and literal dynamic imports reach a whole module; type-only imports carry no
// value and are not followed. One that reaches a module under `to` fails,
// never ratcheted, with the shortest chain. A `from` entry that names no
// audited script fails too, so a renamed directory cannot quietly empty the
// list; a `to` entry may name a module not written yet.

import { bindingChain } from "../import-graph/index.mjs";

export const id = "module-reach";
export const title = "Configured modules never reach configured others through any chain of imports";

const under = (prefixes, file) => prefixes.some((prefix) => (prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix));

export function run(ctx) {
  const boundaries = ctx.CONFIG.reachBoundaries ?? [];
  const findings = [];

  for (const boundary of boundaries) {
    for (const prefix of boundary.from) {
      if (ctx.scriptFiles.some((file) => under([prefix], file))) continue;
      findings.push({
        key: `${boundary.name}::${prefix}`, value: 1, limit: 0, path: "scripts/structure-audit/config.mjs",
        message: `reachBoundaries "${boundary.name}": the from entry "${prefix}" names no audited script. It was renamed or removed; point the entry at where those modules live now, or delete it.`,
        severity: "fail", ratchet: false
      });
    }

    const isTarget = (file) => under(boundary.to, file);
    for (const file of ctx.scriptFiles) {
      if (!under(boundary.from, file) || ctx.isTestFile(file) || isTarget(file)) continue;
      const chain = bindingChain(ctx, file, isTarget);
      if (chain === null) continue;
      const shown = chain.map((step, index) => `${index === 0 ? "   " : "-> "}${step}`).join("\n    ");
      findings.push({
        key: `${boundary.name}::${file}`, value: 1, limit: 0, path: file,
        message: `${file}: reaches ${chain.at(-1)}, which "${boundary.name}" forbids. ${boundary.reason.replace(/\.$/, "")}. The shortest chain:\n    ${shown}\n  ${boundary.remedy}`,
        severity: "fail", ratchet: false
      });
    }
  }

  return findings;
}
