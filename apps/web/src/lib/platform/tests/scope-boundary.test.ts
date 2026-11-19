import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The mechanical rule behind platform scope: no page, route or `lib/auth.ts`
// reaches the primary instance. Platform-scope code (identity, sessions, login
// attempts, owner claim) goes through `lib/platform`; workspace-scope code goes
// through `workspaceFluxIQ` or `workspaceRouteContext`.

const SRC = path.resolve(__dirname, "../../..");
const PRIMARY_ACCESSORS = /\b(getFluxIQ|getFluxIQAfterReload)\b/u;
const FLUXIQ_MODULE = /from\s+["'](?:[^"']*\/)?lib\/fluxiq["']|from\s+["']\.{1,2}\/(?:\.\.\/)*fluxiq["']|import\(\s*["'][^"']*\/fluxiq["']\s*\)/u;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return name === "tests" || name === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/u.test(name) && !/\.test\.(ts|tsx)$/u.test(name) ? [full] : [];
  });
}

/** The files that import a primary accessor from `lib/fluxiq`, as paths under `src`. */
export function primaryAccessorImporters(files: readonly string[], read: (file: string) => string = (file) => readFileSync(file, "utf8")): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const text = read(file);
    for (const statement of text.match(/(?:import|export)[^;]*?from\s+["'][^"']+["']|import\(\s*["'][^"']+["']\s*\)[^;\n]*/gu) ?? []) {
      const fromLibFluxiq = FLUXIQ_MODULE.test(statement) || /["'](?:\.{1,2}\/)+fluxiq["']/u.test(statement);
      if (fromLibFluxiq && PRIMARY_ACCESSORS.test(statement)) offenders.push(path.relative(SRC, file).replaceAll("\\", "/"));
    }
    // A dynamic import is destructured on the line before its string: catch that shape too.
    if (/const\s*\{[^}]*\b(getFluxIQ|getFluxIQAfterReload)\b[^}]*\}\s*=\s*await\s+import\(/u.test(text)) offenders.push(path.relative(SRC, file).replaceAll("\\", "/"));
  }
  return [...new Set(offenders)];
}

describe("platform scope boundary", () => {
  it("lets no app file or lib/auth.ts import the primary instance accessors", () => {
    const files = [...sourceFiles(path.join(SRC, "app")), path.join(SRC, "lib/auth.ts")];
    expect(files.length).toBeGreaterThan(50);
    expect(primaryAccessorImporters(files)).toEqual([]);
  });

  it("catches a primary accessor imported by a route (the rule can fail)", () => {
    const route = path.join(SRC, "app/api/auth/logout/route.ts");
    const mutated = (file: string) => `import { getFluxIQ } from "../../../../lib/fluxiq";\nexport const x = getFluxIQ();\n${file}`;
    expect(primaryAccessorImporters([route], mutated)).toEqual(["app/api/auth/logout/route.ts"]);
    const dynamic = () => 'const { getFluxIQAfterReload } = await import("../../../lib/fluxiq");';
    expect(primaryAccessorImporters([route], dynamic)).toEqual(["app/api/auth/logout/route.ts"]);
  });
});
