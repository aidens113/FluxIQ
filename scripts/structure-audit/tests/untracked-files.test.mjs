// Tests for the file set the structure audit sees (../repository-files.mjs),
// and for rules reading it through a real context (../context.mjs).
//
// The defect these guard against lived in what git was asked for: the audit
// listed only tracked files, so a file an agent had just written -- not yet
// added -- passed every rule and failed only once it had been committed. The
// rule tests elsewhere build a fake ctx by hand and cannot see that, so these
// build a real, throwaway git repository in a temporary directory and put
// fixture files in each state git distinguishes: added, written but never
// added, ignored, and added then deleted.
//
// Nothing is committed. `git ls-files --cached` reads the index, so `git add`
// is enough to make a fixture file tracked.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyRatchet } from "../baseline.mjs";
import { createContext } from "../context.mjs";
import { listRepositoryFiles } from "../repository-files.mjs";
import * as contractSpread from "../rules/contract-spread.mjs";
import * as docsLinks from "../rules/docs-links.mjs";
import * as fileLines from "../rules/file-lines.mjs";
import * as workingDocs from "../rules/working-docs.mjs";

// A git hook exports GIT_DIR and GIT_INDEX_FILE. Left set, they would point
// every git call below -- including the one inside listRepositoryFiles -- at
// the real repository instead of the fixture.
for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];

const git = (root, args, input) => execFileSync("git", args, { cwd: root, input, stdio: ["pipe", "pipe", "ignore"], encoding: "utf8" });

function write(root, file, text) {
  const absolute = path.join(root, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, text, "utf8");
}

// A fresh repository: `ignore` becomes .gitignore, `tracked` files are
// written and added, `untracked` files are written after the add.
function fixture(t, { ignore = "", tracked = {}, untracked = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "structure-audit-files-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ["init", "-q"]);
  if (ignore !== "") write(root, ".gitignore", ignore);
  for (const [file, text] of Object.entries(tracked)) write(root, file, text);
  git(root, ["add", "-A"]);
  for (const [file, text] of Object.entries(untracked)) write(root, file, text);
  return root;
}

// Every finding the way structure-audit.mjs hands it to the ratchet.
const runRule = (rule, ctx) => rule.run(ctx).map((finding) => ({ ...finding, rule: rule.id }));
const noBaseline = { rules: {} };

// --- The listing ---

test("the listing holds tracked and untracked files, and leaves out ignored ones", (t) => {
  const root = fixture(t, {
    ignore: "ignored/\n",
    tracked: { "src/tracked.ts": "" },
    untracked: { "src/untracked.ts": "", "src/new-directory/fresh.ts": "", "ignored/hidden.ts": "" }
  });
  assert.deepEqual(listRepositoryFiles(root), [".gitignore", "src/new-directory/fresh.ts", "src/tracked.ts", "src/untracked.ts"]);
});

test("a tracked file deleted from the working tree is left out, and does not break the listing", (t) => {
  const root = fixture(t, { tracked: { "src/kept.ts": "", "src/deleted.ts": "", "src/replaced/child.ts": "" } });
  rmSync(path.join(root, "src/deleted.ts"));
  // The tracked file's parent directory is now a file, so stat fails with
  // ENOTDIR rather than ENOENT; the listing must survive both.
  rmSync(path.join(root, "src/replaced"), { recursive: true });
  write(root, "src/replaced", "now a file");
  assert.deepEqual(listRepositoryFiles(root), ["src/kept.ts", "src/replaced"]);
});

test("an untracked nested repository, which git lists as a directory, is left out", (t) => {
  const root = fixture(t, { tracked: { "src/a.ts": "" } });
  mkdirSync(path.join(root, "vendor/nested"), { recursive: true });
  git(path.join(root, "vendor/nested"), ["init", "-q"]);
  write(root, "vendor/nested/inner.ts", "");
  assert.deepEqual(listRepositoryFiles(root), ["src/a.ts"]);
});

test("a file with a merge conflict is listed once, not once per conflict stage", (t) => {
  const root = fixture(t, { untracked: { "src/conflict.ts": "x\n" } });
  const blob = git(root, ["hash-object", "-w", "src/conflict.ts"]).trim();
  const stages = [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\tsrc/conflict.ts\n`).join("");
  git(root, ["update-index", "--index-info"], stages);
  assert.equal(git(root, ["ls-files", "--cached"]).split("\n").filter(Boolean).length, 3, "git itself lists the path once per stage");
  assert.deepEqual(listRepositoryFiles(root), ["src/conflict.ts"]);
});

// --- Rules over a real context ---

test("the context's file sets include untracked files", (t) => {
  const root = fixture(t, {
    tracked: { "src/tracked.ts": "", "docs/tracked.md": "" },
    untracked: { "src/untracked.ts": "", "src/styles.css": "", "docs/untracked.md": "" }
  });
  const ctx = createContext({ root, config: {} });
  assert.deepEqual(ctx.files, ["docs/tracked.md", "docs/untracked.md", "src/styles.css", "src/tracked.ts", "src/untracked.ts"]);
  assert.deepEqual(ctx.sourceFiles, ["src/styles.css", "src/tracked.ts", "src/untracked.ts"]);
  assert.deepEqual(ctx.scriptFiles, ["src/tracked.ts", "src/untracked.ts"]);
  assert.equal(ctx.repoRoot, root);
  assert.equal(ctx.read("src/untracked.ts"), "");
});

test("an untracked file over a limit fails: it has no baseline entry, so the ratchet holds it to the limit", (t) => {
  const long = "x;\n".repeat(801);
  const root = fixture(t, { tracked: { "src/old.ts": long }, untracked: { "src/new.ts": long } });
  const findings = runRule(fileLines, createContext({ root, config: {} }));
  assert.deepEqual(findings.map((finding) => finding.key), ["src/new.ts", "src/old.ts"]);
  const result = applyRatchet(findings, { rules: { [fileLines.id]: { "src/old.ts": 801 } } });
  assert.deepEqual(result.failures.map((finding) => finding.key), ["src/new.ts"]);
  assert.deepEqual(result.suppressed.map((finding) => finding.key), ["src/old.ts"]);
});

test("an untracked test with four forbidden spreads fails the contract-spread rule before it is added", (t) => {
  const body = "export const item: C = { ...(a ? { a } : {}), ...(b && { b }), ...{ c }, ...orNone(d) };\n";
  const root = fixture(t, { untracked: { "src/evidence/tests/new.test.ts": body } });
  const config = { contractSpreadPaths: [{ path: "src/evidence", reason: "these modules build page evidence" }] };
  const result = applyRatchet(runRule(contractSpread, createContext({ root, config })), noBaseline);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].key, "src/evidence/tests/new.test.ts");
  assert.equal(result.failures[0].value, 4);
});

test("an untracked document's links are checked, and may point at another untracked file but not an ignored one", (t) => {
  const root = fixture(t, {
    ignore: "docs/generated/\n",
    tracked: { "docs/old.md": "# Old\n" },
    untracked: {
      "docs/new.md": "See [old](./old.md), [sibling](./sibling.md#why), [moved](./moved.md) and [built](./generated/out.md).\n",
      "docs/sibling.md": "# Why\n",
      "docs/generated/out.md": "# Out\n"
    }
  });
  const messages = runRule(docsLinks, createContext({ root, config: { docsLinkDirs: ["docs"] } })).map((finding) => finding.message);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /docs\/new\.md:1: the link to \.\/moved\.md is broken: no file git tracks or would add is at docs\/moved\.md/);
  assert.match(messages[1], /docs\/new\.md:1: the link to \.\/generated\/out\.md is broken: no file git tracks or would add is at docs\/generated\/out\.md/);
});

test("an untracked working document is held to the header rule and counted in the index", (t) => {
  const root = fixture(t, {
    ignore: "docs/working/ignored-plan.md\n",
    untracked: { "docs/working/new-plan.md": "# New plan\n", "docs/working/ignored-plan.md": "# Ignored\n" }
  });
  const config = { workingDocsDir: "docs/working", workingDocsIndexKind: "core" };
  const keys = runRule(workingDocs, createContext({ root, config })).map((finding) => finding.key);
  assert.ok(keys.includes("docs/working/new-plan.md"), `expected a header finding for the new document, got ${keys.join(", ")}`);
  assert.ok(keys.includes("docs/working/README.md"), "the index no longer matches once a new document exists");
  assert.ok(!keys.some((key) => key.includes("ignored-plan")), "an ignored document is not audited");
});
