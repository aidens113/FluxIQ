import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Only inferred, qualified workspace import types are eligible. Public package
// subpaths and ordinary imports remain subject to the consumer-resolution gate.
export function createPublicImportResolver(declarations, compilerOptions) {
  const requests = new Map();
  const roots = new Set();
  for (const { filePath, syntax, imports } of declarations) {
    for (const literal of imports) {
      const node = literal.parent?.parent;
      if (!ts.isImportTypeNode(node) || !node.qualifier || node.isTypeOf) continue;
      if (literal.text.includes("\\")) continue;
      if (!/^packages\/[^/.][^/]*\/dist\/(?:[\w-]+\/)*[\w-]+\.js$/u.test(literal.text)) continue;
      let directory = path.dirname(filePath);
      while (!existsSync(path.join(directory, literal.text.replace(/\.js$/u, ".d.ts")))) {
        const parent = path.dirname(directory);
        if (parent === directory) {
          directory = undefined;
          break;
        }
        directory = parent;
      }
      if (!directory) continue;
      const leaf = canonical(path.join(directory, literal.text.replace(/\.js$/u, ".d.ts")));
      const packageRoot = path.join(directory, ...literal.text.split("/").slice(0, 2));
      const manifestPath = path.join(packageRoot, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (typeof manifest.name !== "string" || !manifest.exports) continue;
      const entries = typeof manifest.exports === "object" && Object.keys(manifest.exports).some((key) => key.startsWith("."))
        ? Object.keys(manifest.exports) : ["."];
      const mode = ts.getModeForUsageLocation(syntax, literal, compilerOptions) ?? ts.ModuleKind.ESNext;
      const candidates = entries.filter((key) => (key === "." || key.startsWith("./")) && !key.includes("*")).flatMap((key) => {
        const specifier = manifest.name + (key === "." ? "" : key.slice(1));
        const resolved = ts.resolveModuleName(specifier, filePath, compilerOptions, ts.sys, undefined, undefined, mode).resolvedModule;
        if (!resolved) return [];
        const target = canonical(resolved.resolvedFileName);
        const relative = path.relative(canonical(packageRoot), target);
        if (relative.startsWith("..") || path.isAbsolute(relative)) return [];
        roots.add(target);
        return [{ specifier, target }];
      });
      roots.add(leaf);
      requests.set(literal, { leaf, candidates, names: node.qualifier.getText().split(".") });
    }
  }
  if (!requests.size) return () => undefined;
  const program = ts.createProgram([...roots], { ...compilerOptions, types: [], noEmit: true });
  const checker = program.getTypeChecker();
  function unalias(symbol) {
    return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  }
  function exported(target, names) {
    const source = program.getSourceFile(target);
    let symbol = source && checker.getSymbolAtLocation(source);
    for (const name of names) {
      if (!symbol) return undefined;
      symbol = unalias(checker.getExportsOfModule(symbol).find((entry) => entry.name === name));
    }
    return symbol;
  }
  return (literal) => {
    const request = requests.get(literal);
    if (!request) return undefined;
    const origin = exported(request.leaf, request.names);
    // Never equate structurally identical or same-named declarations. In
    // particular, a specialized alias is distinct from its generic definition.
    if (!origin || !origin.declarations?.length) return undefined;
    return request.candidates.filter((candidate) => exported(candidate.target, request.names) === origin)
      .sort((left, right) => Number(right.target === request.leaf) - Number(left.target === request.leaf)
        || checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(left.target))).length - checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(right.target))).length
        || left.specifier.localeCompare(right.specifier))[0]?.specifier;
  };
}

function canonical(filePath) {
  return ts.sys.realpath?.(filePath) ?? filePath;
}
