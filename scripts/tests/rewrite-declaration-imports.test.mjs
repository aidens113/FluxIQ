import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repository, "scripts/rewrite-declaration-imports.mjs");
const publicCoreTypes = await readFile(path.join(repository, "packages/contracts/src/core.ts"), "utf8");
const publicCoreExport = JSON.parse(await readFile(path.join(repository, "packages/contracts/package.json"), "utf8")).exports["./core"];

async function write(root, relative, text) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
}

async function fixture(run) {
  const parent = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(parent, "fluxiq-declarations-"));
  const workspace = path.join(root, "workspace");
  const owner = path.join(workspace, "packages/portable-sdk");
  const contracts = path.join(workspace, "packages/contracts");
  try {
    await write(owner, "package.json", JSON.stringify({ name: "portable-sdk", type: "module", exports: { ".": { types: "./dist/index.d.ts" }, "./value": { types: "./dist/value.d.ts" } } }));
    await write(contracts, "package.json", JSON.stringify({ name: "@fluxiq/contracts", type: "module", exports: { "./core": publicCoreExport } }));
    await write(contracts, "dist/core.d.ts", publicCoreTypes);
    await mkdir(path.join(workspace, "node_modules/@fluxiq"), { recursive: true });
    await symlink(contracts, path.join(workspace, "node_modules/@fluxiq/contracts"), process.platform === "win32" ? "junction" : "dir");
    const dist = path.join(owner, "dist");
    await mkdir(dist);
    await run({ root, workspace, owner, contracts, dist });
  } finally {
    const target = await realpath(root);
    assert.equal(path.dirname(target), parent);
    assert.ok(path.basename(target).startsWith("fluxiq-declarations-"));
    await rm(target, { recursive: true, force: true });
  }
}

function rewrite(dist) {
  const result = spawnSync(process.execPath, [script, dist], { encoding: "utf8" });
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
}

function checkedProgram(files, options) {
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
    skipLibCheck: false, types: [], ...options
  });
  return { program, diagnostics: ts.getPreEmitDiagnostics(program) };
}

function noDiagnostics(diagnostics) {
  assert.deepEqual(diagnostics.map((diagnostic) => `${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`), []);
}

test("rewrites actual declaration module specifiers and leaves ordinary strings intact", async () => fixture(async ({ dist }) => {
  await write(dist, "value.d.ts", "export type Value = { value: string };\n");
  await write(dist, "index.d.ts", [
    'import type { JsonObject } from "@fluxiq/contracts/core";',
    "import type { Value } from './value.ts';",
    'export type { Value } from "./value.ts";',
    'export type Deferred = import("./value.ts").Value;',
    'import Required = require("./value.ts");',
    'export type RequiredValue = Required.Value;',
    'export declare const value: JsonObject & Value;',
    'export type Prose = "./kept.ts";',
    '// import("packages/not-an-import.ts")'
  ].join("\n"));
  const result = rewrite(dist);
  assert.equal(result.status, 0, result.output);
  const after = await readFile(path.join(dist, "index.d.ts"), "utf8");
  assert.equal((after.match(/value\.js/g) ?? []).length, 4);
  assert.match(after, /from '\.\/value\.js'/);
  assert.match(after, /Prose = "\.\/kept\.ts"/);
  assert.match(after, /packages\/not-an-import\.ts/);
  assert.match(after, /from "@fluxiq\/contracts\/core"/);
  assert.equal(rewrite(dist).status, 0, "rewriting is idempotent");
}));

test("accepts built-ins, package self exports, and emitted ambient module declarations", async () => fixture(async ({ dist }) => {
  await write(dist, "value.d.ts", "export type Value = string;\n");
  await write(dist, "ambient.d.ts", [
    'declare module "portable-ambient" { export type Ambient = string; }',
    'declare module "*.css" { const theme: string; export default theme; }'
  ].join("\n"));
  await write(dist, "augmentation.d.ts", [
    'import type { JsonObject } from "@fluxiq/contracts/core";',
    'declare module "@fluxiq/contracts/core" { export type Augmented = JsonObject; }'
  ].join("\n"));
  await write(dist, "index.d.ts", [
    'import type { PathLike } from "node:fs";',
    'import type { Readable } from "stream";',
    'import type { Value } from "portable-sdk/value";',
    'import type { Ambient } from "portable-ambient";',
    'import type Theme from "./theme.css";',
    'export type Result = [PathLike, Readable, Value, Ambient, typeof Theme];'
  ].join("\n"));
  const result = rewrite(dist);
  assert.equal(result.status, 0, result.output);
}));

test("honors require-only export conditions for import equals and import type", async () => fixture(async ({ workspace, dist }) => {
  await write(workspace, "node_modules/require-only/package.json", JSON.stringify({ name: "require-only", exports: { ".": { require: { types: "./index.d.cts" } } } }));
  await write(workspace, "node_modules/require-only/index.d.cts", "export type Value = string;\n");
  await write(dist, "index.d.ts", [
    'import Required = require("require-only");',
    'export type RequiredValue = Required.Value;',
    'export type ExplicitMode = import("require-only", { with: { "resolution-mode": "require" } }).Value;'
  ].join("\n"));
  const result = rewrite(dist);
  assert.equal(result.status, 0, result.output);
}));

test("rejects the actual four leaked imports before writing any declaration", async () => fixture(async ({ dist }) => {
  await write(dist, "value.d.ts", "export type Value = string;\n");
  const original = [
    'export type Value = import("./value.ts").Value;',
    'export declare function batch(input: import("packages/contracts/dist/core.js").JsonObject): Promise<import("packages/contracts/dist/core.js").JsonValue>;',
    'export declare function authority(parameters: import("packages/contracts/dist/core.js").JsonObject, effectiveInputs: import("packages/contracts/dist/core.js").JsonObject): void;'
  ].join("\n");
  await write(dist, "index.d.ts", original);
  const result = rewrite(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Nonportable declaration imports/);
  assert.match(result.output, /index\.d\.ts:2:\d+/);
  assert.match(result.output, /not resolvable without workspace aliases/);
  assert.equal((result.output.match(/"packages\/contracts\/dist\/core\.js"/g) ?? []).length, 4);
  assert.equal(await readFile(path.join(dist, "index.d.ts"), "utf8"), original);
}));

test("ignores build baseUrl/paths and rejects an arbitrary unresolved alias", async () => fixture(async ({ owner, dist }) => {
  await write(owner, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@private/values": ["dist/value.d.ts"] } } }));
  await write(dist, "value.d.ts", "export type Value = string;\n");
  await write(dist, "index.d.ts", 'export type { Value } from "@private/values";\n');
  const result = rewrite(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /@private\/values.*not resolvable without workspace aliases/);
}));

test("rejects absolute, platform-specific, and escaping relative paths", async () => fixture(async ({ owner, dist, contracts }) => {
  await write(owner, "outside.d.ts", "export type Value = string;\n");
  for (const specifier of [path.join(contracts, "dist/core.d.ts"), "C:/private/core.d.ts", "/private/core.d.ts", "file:///private/core.d.ts", "..\\outside.d.ts", "../outside.d.ts"]) {
    await write(dist, "index.d.ts", `export type Value = import(${JSON.stringify(specifier)});\n`);
    const result = rewrite(dist);
    assert.notEqual(result.status, 0, specifier);
    assert.match(result.output, /absolute or platform-specific path|relative path escapes declaration output/, specifier);
  }
}));

test("rejects private package subpaths and missing relative targets", async () => fixture(async ({ dist }) => {
  for (const specifier of ["@fluxiq/contracts/dist/core.js", "./missing.ts", "node:missing-builtin"]) {
    await write(dist, "index.d.ts", `export * from ${JSON.stringify(specifier)};\n`);
    const result = rewrite(dist);
    assert.notEqual(result.status, 0, specifier);
    assert.match(result.output, /not resolvable without workspace aliases|absolute or platform-specific path/, specifier);
  }
}));

test("real declaration emit fails for inferred workspace aliases and explicit owned contracts pass an external strict consumer", async () => fixture(async ({ root, workspace, owner, dist }) => {
  await write(owner, "src/core.ts", 'export type { JsonObject, JsonValue } from "@fluxiq/contracts/core";\n');
  await write(owner, "src/contracts.ts", [
    'import type { JsonObject, JsonValue } from "./core.ts";',
    'export type Executor = (input: { value: JsonObject }) => Promise<JsonValue>;',
    'export type Authority = Readonly<{ resolve(parameters: JsonObject, effectiveInputs: JsonObject): JsonObject }>;'
  ].join("\n"));
  await write(owner, "src/index.ts", 'export { create } from "./create.ts";\n');
  async function emit(returnType) {
    await write(owner, "src/create.ts", [
      'import type { Executor, Authority } from "./contracts.ts";',
      `export function create(executeTool: Executor, authority: Authority)${returnType} { return { executeTool, authority }; }`
    ].join("\n"));
    const { program, diagnostics } = checkedProgram([path.join(owner, "src/index.ts")], {
      rootDir: path.join(owner, "src"), outDir: dist, declaration: true,
      emitDeclarationOnly: true, allowImportingTsExtensions: true, baseUrl: workspace, paths: {}
    });
    noDiagnostics(diagnostics);
    noDiagnostics(program.emit().diagnostics);
  }
  const consumer = path.join(root, "external-consumer");
  await write(consumer, "package.json", '{"type":"module"}');
  await mkdir(path.join(consumer, "node_modules/@fluxiq"), { recursive: true });
  await symlink(owner, path.join(consumer, "node_modules/portable-sdk"), process.platform === "win32" ? "junction" : "dir");
  await symlink(path.join(workspace, "packages/contracts"), path.join(consumer, "node_modules/@fluxiq/contracts"), process.platform === "win32" ? "junction" : "dir");
  const consumerFile = path.join(consumer, "consumer.ts");
  const consumerSource = [
    'import { create } from "portable-sdk";',
    'import type { JsonObject, JsonValue } from "@fluxiq/contracts/core";',
    'const value: JsonObject = { count: 1 };',
    'const runtime = create(async (input) => input.value, { resolve(parameters) { return parameters; } });',
    'const result: Promise<JsonValue> = runtime.executeTool({ value });',
    'const resolved: JsonObject = runtime.authority.resolve(value, {});',
    'void result; void resolved;'
  ].join("\n");
  await writeFile(consumerFile, consumerSource, "utf8");

  await emit("");
  const inferred = await readFile(path.join(dist, "create.d.ts"), "utf8");
  assert.match(inferred, /import\("packages\/contracts\/dist\/core\.js"\)/);
  const rejected = rewrite(dist);
  assert.notEqual(rejected.status, 0, rejected.output);
  assert.match(rejected.output, /packages\/contracts\/dist\/core\.js/);
  // Independently prove why the emitted SDK fails without the workspace config.
  // Resolve .ts declaration links only for this diagnostic; leave the aliases intact.
  for (const name of ["index.d.ts", "create.d.ts", "contracts.d.ts"]) {
    const source = await readFile(path.join(dist, name), "utf8");
    await writeFile(path.join(dist, name), source.replace(/\.ts"/g, '.js"'), "utf8");
  }
  const brokenConsumer = checkedProgram([consumerFile], { noEmit: true });
  assert.ok(brokenConsumer.diagnostics.some((diagnostic) => diagnostic.code === 2307 && ts.flattenDiagnosticMessageText(diagnostic.messageText, " ").includes("packages/contracts/dist/core.js")));

  await emit(": { executeTool: Executor; authority: Authority }");
  const accepted = rewrite(dist);
  assert.equal(accepted.status, 0, accepted.output);
  const explicit = await readFile(path.join(dist, "create.d.ts"), "utf8");
  assert.match(explicit, /executeTool: Executor/);
  assert.match(explicit, /authority: Authority/);
  assert.doesNotMatch(explicit, /packages\/contracts\/dist/);
  noDiagnostics(checkedProgram([consumerFile], { noEmit: true }).diagnostics);
  await writeFile(consumerFile, `${consumerSource}\nconst invalid: number = runtime.authority.resolve(value, {});\n`, "utf8");
  assert.ok(checkedProgram([consumerFile], { noEmit: true }).diagnostics.some((diagnostic) => diagnostic.code === 2322), "the consumer retains the actual public JSON type");
}));
