// Unit tests for the restricted-references rule. The rule reaches the
// repository only through ctx, so these build a fake ctx by hand over
// in-memory fixture repositories: no git, no filesystem.
//
// The rule exists so a downstream repository cannot call a model provider
// without the build saying so. The fixtures use made-up hosts, packages and
// key names on purpose: this file is mirrored byte-for-byte into the web
// extension, where it is audited by the very entry it tests, and a real
// provider host here would be a finding there. Every allowed form is paired
// with one that must still fail.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../restricted-references.mjs";

const ENTRY = {
  name: "test vendor",
  imports: [/^vendor-sdk(\/|$)/, /^@vendor\//],
  strings: [/api\.vendor\.example/i, /^VENDOR_SECRET$/],
  names: [/^VENDOR_SECRET$/],
  allow: ["tools/vendor-bridge", "scripts/strip-secrets.mjs"],
  reason: "Only the bridge may reach the vendor.",
  remedy: "Ask the bridge instead."
};

function makeCtx(files, config = { restrictedReferences: [ENTRY] }) {
  const astCache = new Map();
  const isScript = (file) => /\.[cm]?[jt]sx?$/.test(file);
  return {
    ts,
    CONFIG: config,
    files: Object.keys(files),
    scriptFiles: Object.keys(files).filter(isScript),
    read: (file) => files[file],
    normalize: (file) => file,
    basename: (file) => path.posix.basename(file),
    parse: (file) => {
      if (!astCache.has(file)) astCache.set(file, ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      return astCache.get(file);
    }
  };
}

const findingsIn = (source, file = "src/feature/client.ts") => run(makeCtx({ [file]: source }));
const count = (source, file) => findingsIn(source, file).length;

// --- Flagged: every way a script names a restricted reference. ---

test("a restricted host in a string is one failing finding naming file, line, text, reason and remedy", () => {
  const findings = findingsIn('const a = 1;\nawait fetch("https://api.vendor.example/v1/chat");\n');
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, false);
  assert.equal(finding.path, "src/feature/client.ts");
  assert.equal(finding.line, 2);
  assert.match(finding.message, /^src\/feature\/client\.ts:2: contains the string "https:\/\/api\.vendor\.example\/v1\/chat"/);
  assert.match(finding.message, /Only the bridge may reach the vendor\. Ask the bridge instead\./);
  assert.match(finding.message, /"test vendor" entry's allow list/);
});

test("every module-specifier form is flagged", () => {
  for (const source of [
    'import Vendor from "vendor-sdk";',
    'import "vendor-sdk/register";',
    'import type { Client } from "@vendor/client";',
    'export { Client } from "@vendor/client";',
    'export * from "vendor-sdk";',
    'const sdk = await import("vendor-sdk");',
    'const sdk = require("vendor-sdk");',
    'import sdk = require("vendor-sdk");',
    'type Sdk = typeof import("vendor-sdk");'
  ]) {
    const findings = findingsIn(source);
    assert.equal(findings.length, 1, source);
    assert.match(findings[0].message, /imports module "/, source);
  }
});

test("template literal pieces are read, around their substitutions", () => {
  assert.equal(count("const url = `https://api.vendor.example/${route}`;"), 1);
  assert.equal(count("const url = `${base}/x/${route}?h=api.vendor.example`;"), 1);
  assert.equal(count("const url = `https://API.VENDOR.EXAMPLE/v1`;"), 1);
});

test("every way of reading a restricted name is flagged", () => {
  for (const source of [
    "const key = process.env.VENDOR_SECRET;",
    'const key = process.env["VENDOR_SECRET"];',
    "const key = env[`VENDOR_SECRET`];",
    "const { VENDOR_SECRET } = process.env;",
    "const { VENDOR_SECRET: key } = process.env;"
  ]) {
    const findings = findingsIn(source);
    assert.equal(findings.length, 1, source);
    assert.match(findings[0].message, /reads the name "VENDOR_SECRET"/, source);
  }
});

test("tests are audited like source", () => {
  assert.equal(count('await fetch("https://api.vendor.example");', "src/feature/tests/client.test.ts"), 1);
});

test("each occurrence is its own finding, at its own line", () => {
  const findings = findingsIn('fetch("https://api.vendor.example/a");\nfetch("https://api.vendor.example/b");\n');
  assert.deepEqual(findings.map((finding) => finding.line), [1, 2]);
});

// --- Not flagged: what the rule must leave alone. ---

test("comments, regular-expression literals and unrelated text are not read", () => {
  assert.equal(count("// calls https://api.vendor.example\n/* VENDOR_SECRET */\nconst x = 1;"), 0);
  assert.equal(count("const pattern = /api\\.vendor\\.example/;"), 0);
  assert.equal(count('import x from "vendor-sdk-lookalike-not";\nconst y = "vendor-sdk";'), 0);
  assert.equal(count('const name = "VENDOR_SECRET_HINT";\nconst z = obj.VENDOR_SECRETS;'), 0);
});

test("a module specifier is read as an import, not also as a string", () => {
  const config = { restrictedReferences: [{ ...ENTRY, strings: [/vendor-sdk/] }] };
  const findings = run(makeCtx({ "src/a.ts": 'import x from "vendor-sdk";' }, config));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /imports module/);
});

test("an allowed directory and an allowed exact file are skipped; their neighbours are not", () => {
  const source = 'import sdk from "vendor-sdk";\nconst key = process.env.VENDOR_SECRET;';
  assert.equal(count(source, "tools/vendor-bridge/client.ts"), 0);
  assert.equal(count(source, "tools/vendor-bridge/deep/tests/client.test.ts"), 0);
  assert.equal(count(source, "scripts/strip-secrets.mjs"), 0);
  assert.equal(count(source, "tools/vendor-bridge-copy/client.ts"), 2);
  assert.equal(count(source, "scripts/strip-secrets.mjs.bak.ts"), 2);
});

test("an allowance covers only its own entry", () => {
  const other = { name: "other", strings: [/forbidden\.example/], allow: [] };
  const config = { restrictedReferences: [ENTRY, other] };
  const findings = run(makeCtx({ "tools/vendor-bridge/client.ts": 'fetch("https://api.vendor.example");\nfetch("https://forbidden.example");' }, config));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /a restricted other reference/);
});

test("an element-access key that is both a name and a string is reported once", () => {
  assert.equal(count('const key = env["VENDOR_SECRET"];'), 1);
});

test("an empty or missing configuration makes the rule inert", () => {
  const files = { "src/a.ts": 'import x from "vendor-sdk";\nfetch("https://api.vendor.example");' };
  assert.deepEqual(run(makeCtx(files, {})), []);
  assert.deepEqual(run(makeCtx(files, { restrictedReferences: [] })), []);
});

test("global-flag patterns give the same answer on every test", () => {
  const config = { restrictedReferences: [{ ...ENTRY, strings: [/api\.vendor\.example/g] }] };
  const findings = run(makeCtx({ "src/a.ts": 'fetch("https://api.vendor.example/a");\nfetch("https://api.vendor.example/b");\nfetch("https://api.vendor.example/c");' }, config));
  assert.equal(findings.length, 3);
});

// --- package.json: declared dependencies are imports too. ---

test("a restricted dependency in any dependency field is flagged at its line", () => {
  const manifest = [
    "{",
    '  "name": "app",',
    '  "dependencies": {',
    '    "left-pad": "1.0.0",',
    '    "vendor-sdk": "^4.0.0"',
    "  },",
    '  "devDependencies": { "@vendor/client": "1.0.0" },',
    '  "peerDependencies": {',
    '    "vendor-sdk-lookalike": "1.0.0"',
    "  }",
    "}"
  ].join("\n");
  const findings = run(makeCtx({ "packages/app/package.json": manifest }));
  assert.deepEqual(findings.map((finding) => [finding.line, finding.path]), [[5, "packages/app/package.json"], [7, "packages/app/package.json"]]);
  assert.match(findings[0].message, /declares dependency "vendor-sdk" \(dependencies\)/);
  assert.match(findings[1].message, /declares dependency "@vendor\/client" \(devDependencies\)/);
});

test("a package.json under an allowed path is skipped, and other JSON is not read", () => {
  const manifest = '{ "dependencies": { "vendor-sdk": "1.0.0" } }';
  assert.equal(run(makeCtx({ "tools/vendor-bridge/package.json": manifest })).length, 0);
  assert.equal(run(makeCtx({ "fixtures/settings.json": manifest })).length, 0);
});
