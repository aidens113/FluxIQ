import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";
import { readServerBuildIdentity } from "../index";
it("source placeholder stays unattested; malformed executing reader payload fails load", async () => {
  expect(readServerBuildIdentity()).toBeNull();
  const source = await readFile(fileURLToPath(new URL("../read.ts", import.meta.url)), "utf8");
  for (const encoded of ["bad!", Buffer.from("null").toString("base64"), Buffer.from("{}").toString("base64")]) {
    const mutated = source.replace(/__FLUXIQ_SERVER_IDENTITY_BEGIN__[A-Za-z0-9+/=]+__FLUXIQ_SERVER_IDENTITY_END__/, `__FLUXIQ_SERVER_IDENTITY_BEGIN__${encoded}__FLUXIQ_SERVER_IDENTITY_END__`);
    const js = ts.transpileModule(mutated, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`) as { readServerBuildIdentity(): unknown };
    expect(() => loaded.readServerBuildIdentity()).toThrow();
  }
});
