import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import process from "node:process";
import {
  createAutomationStudioScaleCertificationReport,
  createAutomationStudioScaleCertificationTemplate
} from "../packages/fluxiq/dist/programs/automation-studio/testing/index.js";

const evidencePath = readArg("--evidence") ?? process.env.FLUXIQ_STUDIO_CERTIFICATION_EVIDENCE;
const outputPath = readArg("--output") ?? process.env.FLUXIQ_STUDIO_CERTIFICATION_OUTPUT;

const report = evidencePath
  ? createAutomationStudioScaleCertificationReport(JSON.parse(await readFile(evidencePath, "utf8")))
  : createAutomationStudioScaleCertificationTemplate({
      generatedAt: new Date().toISOString(),
      machine: os.hostname(),
      nodeVersion: process.version
    });

const output = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) await writeFile(outputPath, output, "utf8");
process.stdout.write(output);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
