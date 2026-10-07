import { expect, it } from "vitest";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

it("bundles the actual compiled public candidate entry in a browser without server dependencies", async () => {
  const packageRoot = fileURLToPath(new URL("../../../../../../..", import.meta.url));
  const result = await build({
    stdin: { contents: 'export { parseAutomationStudioCandidateAuthoringResult } from "fluxiq/automation-studio/candidate-authoring";', resolveDir: packageRoot },
    tsconfigRaw: {}, platform: "browser", format: "esm", bundle: true, write: false, metafile: true,
  });
  const inputs = Object.keys(result.metafile!.inputs).map((input) => input.split(path.sep).join("/"));
  expect(inputs.some((input) => input.endsWith("dist/programs/automation-studio/runtime/flow-bootstrap/authoring-result/parse.js"))).toBe(true);
  expect(inputs.filter((input) => input !== "<stdin>").every((input) => input.includes("dist/programs/automation-studio/runtime/flow-bootstrap/authoring-result/"))).toBe(true);
  expect(result.outputFiles[0]?.text).toContain("parseAutomationStudioCandidateAuthoringResult");
});
