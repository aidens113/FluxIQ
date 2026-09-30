// The registry against the real repository: every path a registered step's
// projects name is inside that step's fingerprint, every package script and
// the root `build` and `check` run through the cache with the registered
// commands, the web build fingerprints every variable `next.config.ts` reads,
// and no fingerprint names the checkout's own path. The expensive
// counterpart, which asks tsc and Next's traces what they actually load, is
// `prove-inputs.mjs`.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { coversPath, pathSpellings, readWorkspacePackages, REPOSITORY_ROOT, resolveStep, STEPS, tsconfigReferences } from "../index.mjs";

const relative = (file) => path.relative(REPOSITORY_ROOT, file).split(path.sep).join("/") || ".";
const packages = [...readWorkspacePackages(REPOSITORY_ROOT).values()];
const manifest = (dir) => JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
const rootScripts = manifest(REPOSITORY_ROOT).scripts;
const PACKAGE_CALL = /^node \.\.\/\.\.\/scripts\/build-cache\/cli\.mjs (\S+) -- "([^"]*)"$/u;
const ROOT_CALL = /node scripts\/build-cache\/cli\.mjs((?: \S+)+?)(?= &&|$)/gu;
const packageSteps = (kind) => Object.entries(STEPS).filter(([name, step]) => step.kind === kind && step.package !== "." && name.endsWith(`:${kind}`));

/** The paths git ignores, of those given (repository-relative). */
function ignoredByGit(files) {
  if (files.length === 0) return new Set();
  try {
    const out = execFileSync("git", ["-C", REPOSITORY_ROOT, "check-ignore", "--stdin", "--no-index"], { input: files.join("\n"), encoding: "utf8" });
    return new Set(out.split(/\r?\n/u).filter(Boolean));
  } catch (error) {
    // check-ignore exits 1 when none of the paths is ignored.
    if (error.status === 1) return new Set();
    throw error;
  }
}

test("every registered step resolves, names projects that exist, and stamps outside the downstream layer's directory", () => {
  for (const [name, step] of Object.entries(STEPS)) {
    const resolved = resolveStep(name, { env: {} });
    assert.ok(existsSync(resolved.packageDir), `${name}: ${step.package} does not exist`);
    for (const config of resolved.tsconfigs) assert.ok(existsSync(config), `${name}: ${relative(config)} does not exist`);
    assert.match(relative(resolved.stampPath), /node_modules\/\.cache\/fluxiq-core-build\//u, name);
  }
});

test("every tsconfig path a step's projects name is inside that step's fingerprint, and an ignored one inside a walked input", () => {
  const outside = [];
  for (const name of Object.keys(STEPS)) {
    const resolved = resolveStep(name, { env: {} });
    const reachable = [resolved.packageDir, ...packages.filter((pkg) => resolved.dependencies.includes(pkg.name)).map((pkg) => pkg.dir)];
    const references = resolved.tsconfigs.flatMap((config) => tsconfigReferences(config));
    // Two fields name where resolution starts rather than what is read, and
    // prove-inputs.mjs is the guard for both: `baseUrl` (tsconfig.base.json
    // anchors `paths` at the repository root), and a `paths` target inside a
    // package the step neither is nor depends on, which its sources cannot
    // import without that read appearing in tsc's file list.
    const relevant = references.filter(
      (reference) => reference.field !== "baseUrl" && (reference.field !== "paths" || reachable.some((dir) => coversPath(reference.path, { roots: [{ path: dir }] })))
    );
    const ignored = ignoredByGit(relevant.map((reference) => relative(reference.path)));
    for (const reference of relevant) {
      const walked = { roots: [...resolved.roots.filter((root) => root.kind === "walk"), ...resolved.outputs] };
      const covered = ignored.has(relative(reference.path)) ? coversPath(reference.path, walked) : coversPath(reference.path, resolved);
      if (!covered) outside.push(`${name}: ${relative(reference.config)} ${reference.field} "${reference.value}" -> ${relative(reference.path)}`);
    }
  }
  assert.deepEqual(outside, []);
});

test("every project a step's command compiles is one the registry lists", () => {
  for (const [name, step] of Object.entries(STEPS)) {
    for (const invocation of step.command.split("&&").map((part) => part.trim()).filter((part) => /^tsc\b/u.test(part))) {
      const project = /(?:-p|-b) (\S+)/u.exec(invocation)?.[1] ?? "tsconfig.json";
      assert.ok(step.tsconfigs.includes(project), `${name} compiles ${project}, which its tsconfigs do not list`);
    }
  }
});

test("every package build and check script goes through the cache with the registered command", () => {
  const used = new Set();
  for (const pkg of packages) {
    const scripts = manifest(pkg.dir).scripts ?? {};
    for (const kind of ["build", "check"]) {
      if (scripts[kind] === undefined) continue;
      const call = PACKAGE_CALL.exec(scripts[kind]);
      assert.ok(call, `${relative(pkg.dir)} ${kind} does not run through the cache: ${scripts[kind]}`);
      const [, stepName, command] = call;
      assert.equal(stepName, `${path.basename(pkg.dir)}:${kind}`, `${relative(pkg.dir)} ${kind}`);
      assert.ok(Object.hasOwn(STEPS, stepName), `${stepName} is not registered`);
      assert.equal(STEPS[stepName].package, relative(pkg.dir), stepName);
      assert.equal(command, STEPS[stepName].command, stepName);
      used.add(stepName);
    }
  }
  for (const kind of ["build", "check"]) for (const [name] of packageSteps(kind)) assert.ok(used.has(name), `${name} is registered but no package script runs it`);
});

test("root build runs every package build, dependencies first; root check runs the tests, the cached audit and every package check", () => {
  const builds = [...rootScripts.build.matchAll(ROOT_CALL)].map((call) => call[1].trim().split(" "));
  assert.equal(builds.length, 1, rootScripts.build);
  const [order] = builds;
  assert.deepEqual([...order].sort(), packageSteps("build").map(([name]) => name).sort());
  for (const [index, name] of order.entries()) {
    for (const dependency of resolveStep(name, { env: {} }).dependencies) {
      const earlier = order.findIndex((other) => resolveStep(other, { env: {} }).packageName === dependency);
      assert.ok(earlier !== -1 && earlier < index, `${name} runs before the build of ${dependency}`);
    }
  }

  const check = rootScripts.check;
  // The script suites run as one node --test, which runs their files side by
  // side; each suite's own script stays for running it alone.
  const globs = (script) => [...script.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  const [prefix] = check.split(" && ");
  assert.match(prefix, /^node --test /u, "root check starts with one node --test over the script suites");
  for (const script of ["structure:test", "task:test", "build-cache:test"]) {
    assert.match(rootScripts[script], /^node --test /u, script);
    for (const glob of globs(rootScripts[script])) assert.ok(globs(prefix).includes(glob), `root check does not run ${script}'s ${glob}`);
  }
  const calls = [...check.matchAll(ROOT_CALL)].map((call) => call[1].trim().split(" "));
  assert.deepEqual(calls[0], ["structure-audit:check"]);
  assert.equal(calls[1][0], "--parallel");
  assert.deepEqual(calls[1].slice(1).sort(), packageSteps("check").map(([name]) => name).sort());
  assert.equal(rootScripts["structure:check"], STEPS["structure-audit:check"].command, "the uncached audit stays available, for --rule and --update");
  assert.ok(!check.includes("pnpm -r check"), "package checks run once, through the cache");
});

test("the web build fingerprints every environment variable next.config.ts reads", () => {
  const config = readFileSync(path.join(REPOSITORY_ROOT, "apps/web/next.config.ts"), "utf8");
  assert.doesNotMatch(config, /process\.env(?!\.[A-Za-z_]|\[\s*["'])/u, "next.config.ts reads the environment in a way this test cannot enumerate");
  const step = STEPS["web:build"];
  for (const [, dotted, indexed] of config.matchAll(/process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["']([^"']+)["']\s*\])/gu)) {
    const name = dotted ?? indexed;
    const covered = step.env.includes(name) || step.envPrefixes.some((prefix) => name.toUpperCase().startsWith(prefix));
    assert.ok(covered, `next.config.ts reads ${name}, which web:build does not fingerprint`);
  }
});

test("no step's metadata or labels name the checkout's path, even with absolute-path environment values", () => {
  const env = { NODE_ENV: "production", NEXT_PUBLIC_ROOT: path.join(REPOSITORY_ROOT, "apps", "web") };
  const spellings = pathSpellings([REPOSITORY_ROOT]);
  for (const name of Object.keys(STEPS)) {
    const resolved = resolveStep(name, { env });
    const shown = JSON.stringify({ meta: resolved.meta, roots: resolved.roots.map((root) => root.label), outputs: resolved.outputs.map((output) => output.label) }).toLowerCase();
    for (const spelling of spellings) assert.ok(!shown.includes(spelling), `${name} fingerprints ${spelling}`);
  }
});
