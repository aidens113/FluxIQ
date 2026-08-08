import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { compileFlowSource } from "../packages/fluxiq/dist/programs/automation-studio/dsl/index.js";

const args = process.argv.slice(2);
const mode = args.includes("--build") ? "build" : "check";
const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const projectId = option("--project", "ci");
const outDir = path.resolve(option("--out-dir", ".fluxiq/cache/compiled-flows"));
const consumed = new Set(["--project", "--out-dir"].flatMap((name) => { const index = args.indexOf(name); return index >= 0 ? [index + 1] : []; }));
const inputs = args.filter((value, index) => !value.startsWith("--") && !consumed.has(index));
if (!inputs.length) { process.stderr.write("Usage: pnpm flows:check -- <file-or-directory> [--project id]\n"); process.exitCode = 2; }
else {
  const files = (await Promise.all(inputs.map((input) => collect(path.resolve(input))))).flat().sort();
  let failed = false;
  for (const file of files) {
    const source = await readFile(file, "utf8"); const result = compileFlowSource(source, { projectId, moduleId: path.relative(process.cwd(), file).replaceAll("\\", "/") });
    if (!result.ok) { failed = true; for (const diagnostic of result.diagnostics) process.stderr.write(`${diagnostic.location?.moduleId ?? file}:${diagnostic.location?.line ?? 1}:${diagnostic.location?.column ?? 1} ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}${diagnostic.remediation ? ` ${diagnostic.remediation}` : ""}\n`); continue; }
    process.stdout.write(`${mode === "build" ? "built" : "valid"} ${file} ${result.plan.digest}\n`);
    if (mode === "build") { await mkdir(outDir, { recursive: true }); await writeFile(path.join(outDir, `${safe(result.plan.flow.flowId)}.json`), `${JSON.stringify(result.plan, null, 2)}\n`, "utf8"); }
  }
  if (!files.length) { process.stderr.write("No .flow.ts files found.\n"); failed = true; }
  if (failed) process.exitCode = 1;
}

async function collect(target) { const info = await stat(target); if (info.isFile()) return target.endsWith(".flow.ts") ? [target] : []; const entries = await readdir(target, { withFileTypes: true }); return (await Promise.all(entries.filter((entry) => !["node_modules", ".git", ".fluxiq"].includes(entry.name)).map((entry) => collect(path.join(target, entry.name))))).flat(); }
function safe(value) { return value.replace(/[^A-Za-z0-9._-]+/g, "-") || "flow"; }
