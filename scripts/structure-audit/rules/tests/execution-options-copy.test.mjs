import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { run } from "../execution-options-copy.mjs";

const TYPE = "AutomationStudioGraphExecutionOptions";
const OPTIONS = `export type ${TYPE} = { maxSteps?: number; label?: string };`;
const COPY = `import type { ${TYPE} as Options } from "./options.ts";
export function copyAutomationExecutionOptions(source?: Options, changes: Partial<Options> = {}): Options {
  return { ...source, ...changes };
}`;
const CONFIG = {
  from: ["src/"], tsconfig: "tsconfig.json", declaration: "src/options.ts",
  typeName: TYPE, copy: "src/copy.ts"
};
const TSCONFIG = JSON.stringify({
  compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, types: [], lib: ["ES2022"], allowImportingTsExtensions: true },
  include: ["src/**/*.ts", "src/**/*.js"]
});

function fixture(t, extra = {}, overrides = {}) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, "fluxiq-options-copy-"));
  t.after(() => {
    // This exact root was issued above; verify the absolute disposable target.
    assert.ok(path.resolve(root).startsWith(path.join(parent, "fluxiq-options-copy-")));
    assert.notEqual(root, parent);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const files = {
    "tsconfig.json": TSCONFIG, "src/options.ts": OPTIONS, "src/copy.ts": COPY,
    "src/ordinary.ts": "export const fresh = { maxSteps: 2 };", ...extra
  };
  for (const [file, value] of Object.entries(files)) {
    const filename = path.join(root, file);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, value);
  }
  const parse = file => ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return {
    repoRoot: root, ts, CONFIG: { executionOptionsCopy: { ...CONFIG, ...overrides }, testRootDirNames: ["tests", "e2e"] },
    files: Object.keys(files), scriptFiles: Object.keys(files).filter(file => /\.[cm]?[jt]sx?$/u.test(file)),
    isTestFile: file => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file),
    read: file => files[file], parse
  };
}

const paths = findings => findings.map(finding => finding.path);

test("uses the original type declaration and reports the exact expression and line", t => {
  const ctx = fixture(t, {
    "src/consumer.ts": `import type { ${TYPE} } from "./options.ts";
export function run(request: { options?: ${TYPE} }) {
  return { ...request.options, maxSteps: 3 };
}`
  });
  const findings = run(ctx);
  assert.deepEqual(paths(findings), ["src/consumer.ts"]);
  assert.equal(findings[0].line, 3);
  assert.equal(findings[0].ratchet, false);
  assert.equal(findings[0].severity, "fail");
  assert.match(findings[0].message, /\.\.\.request\.options/);
  assert.match(findings[0].message, /copyAutomationExecutionOptions/);
});

test("loads extended tsconfig paths and follows renamed imports and reexports", t => {
  const ctx = fixture(t, {
    "configs/base.json": JSON.stringify({ compilerOptions: { baseUrl: "..", paths: { "@graph": ["src/contracts/index.ts"] } } }),
    "tsconfig.json": JSON.stringify({ extends: "./configs/base.json", compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: [], lib: ["ES2022"] }, include: ["src/**/*.ts"] }),
    "src/contracts/index.ts": `export type { ${TYPE} as PublicOptions } from "../options.ts";`,
    "src/consumer.ts": `import type { PublicOptions as CompletelyDifferentName } from "@graph";
export const duplicate = (value: CompletelyDifferentName) => ({ ...value });`
  });
  assert.deepEqual(paths(run(ctx)), ["src/consumer.ts"]);
});

test("recognizes optional, Partial, Readonly, union, intersection and nested alias options", t => {
  const ctx = fixture(t, {
    "src/consumer.ts": `import type { ${TYPE} as O } from "./options.ts";
type Nested<T> = Readonly<Partial<T>>;
type Alias = Nested<O>;
export function duplicate(a?: O, b?: Partial<O>, c?: Readonly<O>, d?: O | { other: true }, e?: O & { tag: string }, f?: Alias) {
  return [{ ...a }, { ...b }, { ...c }, { ...d }, { ...e }, { ...f }];
}`
  });
  const findings = run(ctx);
  assert.equal(findings.length, 6);
  assert.ok(findings.every(finding => finding.path === "src/consumer.ts"));
});

test("follows an interface extension, constrained type parameter and property getter type", t => {
  const ctx = fixture(t, {
    "src/consumer.ts": `import type { ${TYPE} as O } from "./options.ts";
interface Extended extends O { more?: string }
export function duplicate<T extends O>(value: T, extended: Extended, owner: { get configuration(): O | undefined }) {
  return [{ ...value }, { ...extended }, { ...owner.configuration }];
}`
  });
  assert.equal(run(ctx).length, 3);
});

test("recognizes the original type through transparent casts and nullish expressions", t => {
  const ctx = fixture(t, {
    "src/consumer.ts": `import type { ${TYPE} as O } from "./options.ts";
export const duplicate = (value?: O) => [{ ...(value ?? {}) }, { ...(value as any) }, { ...(value! satisfies O) }];`
  });
  assert.equal(run(ctx).length, 3);
});

test("recognizes JS source typed by the original imported declaration", t => {
  const ctx = fixture(t, {
    "src/consumer.js": `/** @param {import("./options.ts").${TYPE}} original */
export function duplicate(original) { return { ...original }; }`
  });
  assert.deepEqual(paths(run(ctx)), ["src/consumer.js"]);
});

test("does not confuse ordinary JSON, settings, same-shaped types or fresh options with the owner", t => {
  const ctx = fixture(t, {
    "src/other.ts": `export type ${TYPE} = { maxSteps?: number };`,
    "src/consumer.ts": `import type { ${TYPE} as O } from "./options.ts";
import type { ${TYPE} as Counterfeit } from "./other.ts";
type Settings = { maxSteps?: number };
export function copy(json: Record<string, unknown>, settings: Settings, other: Counterfeit, arbitrary: any, unknownValue: unknown, container: { original: O }) {
  const fresh: O = { maxSteps: 3 };
  return [{ ...json }, { ...settings }, { ...other }, { ...arbitrary }, { ...unknownValue }, { ...container }, fresh, { ...{ maxSteps: 2 } }];
}`
  });
  assert.deepEqual(run(ctx), []);
});

test("exempts only the original configured copy body, not its name elsewhere or another body in the file", t => {
  const ctx = fixture(t, {
    "src/copy.ts": `${COPY}
export function alsoUnsafe(source: Options) { return { ...source }; }`,
    "src/consumer.ts": `import type { ${TYPE} as O } from "./options.ts";
export function copyAutomationExecutionOptions(original: O) { return { ...original }; }`
  });
  assert.deepEqual(paths(run(ctx)).sort(), ["src/consumer.ts", "src/copy.ts"]);
});

test("does not mistake generic containers of options for an option-object copy", t => {
  const ctx = fixture(t, {
    "src/consumer.ts": `import type { ${TYPE} as O } from "./options.ts";
type Container<T> = { original: T };
type Callback<T> = () => T;
export function copy(box: Container<O>, dictionary: Record<string, O>, callback: Callback<O>, list: O[]) {
  return [{ ...box }, { ...dictionary }, { ...callback }, { ...list }];
}`
  });
  assert.deepEqual(run(ctx), []);
});

test("rejects a copy-module reexport whose implementation is owned by another file", t => {
  const ctx = fixture(t, {
    "src/copy.ts": 'export { copyAutomationExecutionOptions } from "./wrapper.ts";',
    "src/wrapper.ts": COPY
  });
  const findings = run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /original exported copyAutomationExecutionOptions implementation/);
});

test("excludes fixture helpers in configured test/e2e roots and checks shipped support", t => {
  const consumer = `import type { ${TYPE} as O } from "../options.ts"; export const copy = (value: O) => ({ ...value });`;
  const ctx = fixture(t, {
    "src/tests/fixture.ts": consumer, "src/e2e/fixture.ts": consumer,
    "src/testing/support.ts": consumer, "src/plain.test.ts": consumer
  });
  assert.deepEqual(paths(run(ctx)), ["src/testing/support.ts"]);
});

test("honors custom configured fixture-root names", t => {
  const ctx = fixture(t, {
    "src/scenarios/support.ts": `import type { ${TYPE} as O } from "../options.ts"; export const copy = (value: O) => ({ ...value });`
  });
  ctx.CONFIG.testRootDirNames.push("scenarios");
  assert.deepEqual(run(ctx), []);
});

test("has a fast no-op when the repository does not configure this rule", () => {
  assert.deepEqual(run({ CONFIG: {}, get scriptFiles() { throw new Error("must not inspect"); } }), []);
});

for (const field of ["tsconfig", "declaration", "copy"]) {
  test(`fails closed when the configured ${field} file is missing`, t => {
    const findings = run(fixture(t, {}, { [field]: "missing.ts" }));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].ratchet, false);
    assert.match(findings[0].message, /could not verify/);
  });
}

test("fails closed on malformed tsconfig and missing original type declaration", t => {
  const malformed = run(fixture(t, { "tsconfig.json": "{" }));
  assert.equal(malformed.length, 1);
  assert.match(malformed[0].message, /could not verify/);
  const absent = run(fixture(t, { "src/options.ts": "export type Other = {};" }));
  assert.equal(absent.length, 1);
  assert.match(absent[0].message, /exactly one original/);
});

test("fails closed on a configured option type that cannot resolve", t => {
  const findings = run(fixture(t, { "src/options.ts": `export type ${TYPE} = MissingOriginalType;` }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /cannot be resolved/);
});

test("fails closed when any configured source prefix is empty", t => {
  const findings = run(fixture(t, {}, { from: ["src/", "renamed/"] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /renamed.*no inspected production source/);
});

test("fails closed for empty or incomplete rule configuration", t => {
  for (const overrides of [{ from: [] }, { typeName: "" }, { tsconfig: undefined }]) {
    const findings = run(fixture(t, {}, overrides));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].path, "scripts/structure-audit/config.mjs");
  }
});

test("reports an unresolved mapped alias that explicitly retains the original owner", t => {
  const ctx = fixture(t, {
    "src/consumer.ts": `import type { ${TYPE} as Original } from "./options.ts";
type Broken = MissingMappedType<Original>;
export function copy(value: Broken) { return { ...value }; }`
  });
  const findings = run(ctx);
  assert.deepEqual(paths(findings), ["src/consumer.ts"]);
  assert.match(findings[0].message, /cannot resolve.*execution-option alias/);
});

test("does not label unrelated unresolved JSON imports as original option types", t => {
  const ctx = fixture(t, {
    "src/consumer.ts": 'import type { Json } from "./unrelated-missing-json.ts"; export function copy(data: Json) { return { ...data }; }'
  });
  // Ordinary package tsc still rejects that missing dependency; this guard is
  // not an alternate whole-project compiler or a name-based JSON prohibition.
  assert.deepEqual(run(ctx), []);
});

test("fails closed on syntax errors in inspected spread source", t => {
  const ctx = fixture(t, {
    "src/consumer.ts": `import type { ${TYPE} as O } from "./options.ts"; export function copy(value: O) { return { ...value`
  });
  const findings = run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /syntax errors/);
});
