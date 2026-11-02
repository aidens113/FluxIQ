// Execution option objects carry private companions that object spread cannot copy.
// Recognize the configured original declaration through the compiler, never by a
// variable name, a matching property bag, or serialized execution metadata.
import fs from "node:fs";
import path from "node:path";

export const id = "execution-options-copy";
export const title = "Execution options are copied with their original private companions";

const COPY_EXPORT = "copyAutomationExecutionOptions";
const CONFIG_PATH = "scripts/structure-audit/config.mjs";
const slashes = value => value.replaceAll("\\", "/");
const under = (file, prefix) => prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix;

function failure(key, message, file = CONFIG_PATH, line) {
  return {
    key, value: 1, limit: 0, path: file, ...(line === undefined ? {} : { line }),
    severity: "fail", ratchet: false, message: `${file}${line === undefined ? "" : `:${line}`}: ${message}`
  };
}

function configuredPath(root, value, field) {
  if (typeof value !== "string" || !value.trim() || path.isAbsolute(value)) throw new Error(`executionOptionsCopy.${field} must be a repository-relative path.`);
  const absolute = path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) throw new Error(`executionOptionsCopy.${field} leaves the repository.`);
  return absolute;
}

function configuration(ctx, config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("executionOptionsCopy must name its source scope, tsconfig, original declaration and copy implementation.");
  if (!Array.isArray(config.from) || !config.from.length || config.from.some(prefix => typeof prefix !== "string" || !prefix.trim())) throw new Error("executionOptionsCopy.from must contain a nonempty source scope.");
  if (typeof config.typeName !== "string" || !config.typeName.trim()) throw new Error("executionOptionsCopy.typeName must name the original exported type.");
  if (!Array.isArray(ctx.CONFIG.testRootDirNames) || ctx.CONFIG.testRootDirNames.some(name => typeof name !== "string" || !name)) throw new Error("testRootDirNames must declare excluded fixture roots.");
  const root = path.resolve(ctx.repoRoot);
  for (const prefix of config.from) configuredPath(root, prefix, "from");
  const result = { root, from: config.from.map(slashes), typeName: config.typeName };
  for (const field of ["tsconfig", "declaration", "copy"]) {
    const filename = configuredPath(root, config[field], field);
    if (!fs.statSync(filename).isFile()) throw new Error(`executionOptionsCopy.${field} must name an existing file.`);
    result[field] = filename;
  }
  return result;
}

function compilerOptions(ts, filename) {
  const loaded = ts.readConfigFile(filename, ts.sys.readFile);
  if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, " "));
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(filename), undefined, filename);
  if (parsed.errors.length) throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, " ")).join("; "));
  // Root names are selected below; do not diagnose or emit the complete project.
  return { ...parsed.options, noEmit: true, allowJs: true };
}

function spreadNodes(ts, source) {
  const spreads = [];
  const visit = node => {
    if (ts.isSpreadAssignment(node)) spreads.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return spreads;
}

function originalSymbol(ts, checker, symbol) {
  return symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
}

function typeOwner(ts, checker, source, typeName) {
  const declarations = source.statements.filter(node => (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name.text === typeName);
  if (declarations.length !== 1) throw new Error(`Configured declaration must contain exactly one original ${typeName} declaration.`);
  const symbol = checker.getSymbolAtLocation(declarations[0].name);
  const module = checker.getSymbolAtLocation(source);
  const exported = module && checker.getExportsOfModule(module).find(entry => entry.getName() === typeName);
  if (!symbol || originalSymbol(ts, checker, exported) !== symbol) throw new Error(`Configured ${typeName} is not the original exported declaration.`);
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) throw new Error(`Configured ${typeName} cannot be resolved to its original option type.`);
  return symbol;
}

function copyBody(ts, checker, source, key) {
  const module = checker.getSymbolAtLocation(source);
  const exported = module && checker.getExportsOfModule(module).find(entry => entry.getName() === COPY_EXPORT);
  const symbol = originalSymbol(ts, checker, exported);
  const bodies = (symbol?.declarations ?? []).flatMap(node => {
    if (key(node.getSourceFile().fileName) !== key(source.fileName)) return [];
    if (ts.isFunctionDeclaration(node) && node.body) return [node.body];
    if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) return [node.initializer.body];
    return [];
  });
  if (bodies.length !== 1) throw new Error(`executionOptionsCopy.copy must contain the original exported ${COPY_EXPORT} implementation.`);
  return bodies[0];
}

function containsOptions(ts, checker, owner, type, seen = new Set()) {
  if (!type || seen.has(type)) return false;
  seen.add(type);
  if ([type.aliasSymbol, type.getSymbol()].some(symbol => originalSymbol(ts, checker, symbol) === owner)) return true;
  const related = [...(type.types ?? [])];
  if (type.aliasTypeArguments?.length) {
    // Mapped option views keep the original property declarations. A container
    // whose values merely contain options does not copy the option object.
    const properties = new Set(checker.getDeclaredTypeOfSymbol(owner).getProperties().flatMap(property => property.declarations ?? []));
    if (type.getProperties().some(property => property.declarations?.some(declaration => properties.has(declaration)))) related.push(...type.aliasTypeArguments);
    // Error aliases have no reliable property set; their retained original type
    // arguments still identify a relevant unresolved execution-option alias.
    else if (type.flags & ts.TypeFlags.Any && type.intrinsicName === "error") related.push(...type.aliasTypeArguments);
  }
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type);
    if (constraint) related.push(constraint);
  }
  if (type.flags & ts.TypeFlags.Object && type.objectFlags & ts.ObjectFlags.Interface) related.push(...checker.getBaseTypes(type));
  return related.some(candidate => containsOptions(ts, checker, owner, candidate, seen));
}

// An erroneous mapped/import alias may erase its type arguments to the compiler's
// error-any. Follow only its explicit type declarations for original-owner evidence;
// unrelated JSON any/unknown is not evidence of an execution option object.
function originalTypeSyntax(ts, checker, owner, expression) {
  const visited = new Set();
  const symbolContains = symbol => {
    const target = originalSymbol(ts, checker, symbol);
    if (!target || visited.has(target)) return false;
    visited.add(target);
    if (target === owner) return true;
    return (target.declarations ?? []).some(declaration => {
      if (ts.isTypeAliasDeclaration(declaration)) return visit(declaration.type);
      if (declaration.type) return visit(declaration.type);
      return false;
    });
  };
  const visit = node => {
    if (ts.isTypeReferenceNode(node) && symbolContains(checker.getSymbolAtLocation(node.typeName))) return true;
    let found = false;
    ts.forEachChild(node, child => { if (visit(child)) found = true; });
    return found;
  };
  const location = ts.isPropertyAccessExpression(expression) ? expression.name : expression;
  return symbolContains(checker.getSymbolAtLocation(location));
}

function optionExpression(ts, checker, owner, expression) {
  const type = checker.getTypeAtLocation(expression);
  const options = containsOptions(ts, checker, owner, type);
  if (type.flags & ts.TypeFlags.Any && (options || type.intrinsicName === "error" && originalTypeSyntax(ts, checker, owner, expression))) return "unresolved";
  if (options) return "options";
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) return optionExpression(ts, checker, owner, expression.expression);
  return undefined;
}

function inspect(ctx, configured) {
  const ts = ctx.ts;
  const keys = new Map();
  const key = filename => {
    if (keys.has(filename)) return keys.get(filename);
    const absolute = slashes(fs.realpathSync(filename));
    const normalized = ts.sys.useCaseSensitiveFileNames ? absolute : absolute.toLowerCase();
    keys.set(filename, normalized);
    return normalized;
  };
  const source = ctx.scriptFiles.filter(file => configured.from.some(prefix => under(slashes(file), prefix)) && !ctx.isTestFile(file) && !slashes(file).split("/").some(part => ctx.CONFIG.testRootDirNames.includes(part)));
  for (const prefix of configured.from) if (!source.some(file => under(slashes(file), prefix))) throw new Error(`executionOptionsCopy.from entry ${prefix} names no inspected production source.`);
  const candidates = source.filter(file => ctx.read(file).includes("...") && spreadNodes(ts, ctx.parse(file)).length);
  const options = compilerOptions(ts, configured.tsconfig);
  const program = ts.createProgram({ rootNames: [...new Set([...candidates.map(file => path.resolve(configured.root, file)), configured.declaration, configured.copy])], options });
  const checker = program.getTypeChecker();
  const declaration = program.getSourceFile(configured.declaration);
  const helper = program.getSourceFile(configured.copy);
  if (!declaration || !helper) throw new Error("The compiler did not load the configured option declaration and copy implementation.");
  const owner = typeOwner(ts, checker, declaration, configured.typeName);
  const allowed = copyBody(ts, checker, helper, key);
  const findings = [];
  for (const file of candidates) {
    const parsed = program.getSourceFile(path.resolve(configured.root, file));
    if (!parsed) throw new Error(`The compiler did not load inspected source ${file}.`);
    if (parsed.parseDiagnostics.length) {
      findings.push(failure(`${file}:syntax`, "Execution-option spreads cannot be verified while this source has syntax errors.", file, 1));
      continue;
    }
    for (const node of spreadNodes(ts, parsed)) {
      if (key(parsed.fileName) === key(helper.fileName) && node.pos >= allowed.pos && node.end <= allowed.end) continue;
      const kind = optionExpression(ts, checker, owner, node.expression);
      if (!kind) continue;
      const { line, character } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
      const expression = node.expression.getText(parsed);
      const reason = kind === "unresolved" ? "cannot resolve this original execution-option alias" : "object spread loses the original execution-option private companions";
      findings.push(failure(`${file}:${line + 1}:${character + 1}`, `${reason}: ...${expression}. Use ${COPY_EXPORT}(source, changes) instead.`, file, line + 1));
    }
  }
  return findings;
}

export function run(ctx) {
  const config = ctx.CONFIG?.executionOptionsCopy;
  if (config === undefined) return [];
  try {
    return inspect(ctx, configuration(ctx, config));
  } catch (error) {
    return [failure("configuration", `executionOptionsCopy could not verify its configured source/type authority: ${error instanceof Error ? error.message : String(error)}`)];
  }
}
