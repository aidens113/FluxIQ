import { expect, it } from "vitest";
import { readCoreRuntimeBuildIdentity } from "../index.ts";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

it("unbuilt source refuses to claim executing artifact identity", () => { expect(readCoreRuntimeBuildIdentity()).toBeNull(); });
it("malformed embedded JSON fails explicitly rather than returning an absent identity", async () => {
  const source = (await readFile(new URL("../read.ts", import.meta.url), "utf8")).replace('{"fluxiqRuntimeIdentityPlaceholder":302}', "malformed-json");
  const compiled = await transform(source, { loader: "ts", format: "cjs" });
  const module = { exports: {} as { readCoreRuntimeBuildIdentity(): unknown } };
  new Function("module", "exports", compiled.code)(module, module.exports);
  expect(() => module.exports.readCoreRuntimeBuildIdentity()).toThrow();
});
