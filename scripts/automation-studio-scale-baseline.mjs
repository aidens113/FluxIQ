import { writeFile } from "node:fs/promises";
import process from "node:process";
import {
  AUTOMATION_STUDIO_BASELINE_NODE_COUNTS,
  measureAutomationStudioLegacyBaseline
} from "../packages/fluxiq/dist/programs/automation-studio/testing/index.js";

const counts = process.argv.slice(2).map(Number).filter((value) => Number.isFinite(value) && value > 0);
const selectedCounts = counts.length ? counts : [...AUTOMATION_STUDIO_BASELINE_NODE_COUNTS];
const report = {
  schemaVersion: "0.1",
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  platform: `${process.platform}-${process.arch}`,
  results: selectedCounts.map((count) => measureAutomationStudioLegacyBaseline(count))
};
const output = `${JSON.stringify(report, null, 2)}\n`;

if (process.env.FLUXIQ_BASELINE_OUTPUT) {
  await writeFile(process.env.FLUXIQ_BASELINE_OUTPUT, output, "utf8");
}
process.stdout.write(output);
