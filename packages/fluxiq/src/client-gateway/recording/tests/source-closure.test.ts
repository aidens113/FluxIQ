import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { recordingDeclarationClosure } from "./closure.ts";

const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const roots = ["client-gateway/recording/index.ts", "runtime/recording/io/index.ts"].map(owner => path.join(sourceRoot, owner));

it("loads canonical capture and IO without Studio even through erased type imports", async () => {
  const program = ts.createProgram(roots, {
    noEmit: true, allowImportingTsExtensions: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, types: []
  });
  const closure = recordingDeclarationClosure(program, roots);
  const typeClosure = closure.files.map(filename => filename.replaceAll("\\", "/"));
  expect(typeClosure.length).toBeGreaterThan(20);
  expect(closure.forbiddenImports).toEqual([]);
  expect(typeClosure.filter(filename => /\/programs\/automation-studio\//u.test(filename))).toEqual([]);
  expect(typeClosure.filter(filename => /\/engine\//u.test(filename))).toEqual([]);
  const bundled = await build({ entryPoints: roots, outdir: "capture-closure", bundle: true, write: false, metafile: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
  const runtimeClosure = Object.keys(bundled.metafile!.inputs).map(filename => filename.replaceAll("\\", "/"));
  expect(runtimeClosure.filter(filename => filename.includes("automation-studio"))).toEqual([]);
  expect(runtimeClosure.filter(filename => /(?:^|\/)engine\//u.test(filename))).toEqual([]);
});
