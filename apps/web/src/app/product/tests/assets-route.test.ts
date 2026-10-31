import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../assets/[name]/route";
import { FIXTURE_ASSETS, FULL_PRODUCT, registerProduct, resetPanelProductState } from "./support";

afterEach(resetPanelProductState);

const get = (name: string) => GET(new Request(`http://panel.test/product/assets/${name}`), { params: Promise.resolve({ name }) });

describe("the product assets route", () => {
  it("serves a declared svg with its type and hardening headers", async () => {
    registerProduct(FULL_PRODUCT, FIXTURE_ASSETS);
    const response = await get("logo.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(await response.text()).toContain("<svg");
  });

  it("serves a declared ico without a content security policy", async () => {
    registerProduct(FULL_PRODUCT, FIXTURE_ASSETS);
    const response = await get("favicon.ico");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/x-icon");
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("answers 404 with no body for undeclared names and traversal attempts", async () => {
    registerProduct(FULL_PRODUCT, FIXTURE_ASSETS);
    for (const name of ["other.svg", "../fixture-host-module.mjs", "..%2ffixture-host-module.mjs", "..\\logo.svg", "logo.svg/", ""]) {
      const response = await get(name);
      expect([name, response.status]).toEqual([name, 404]);
      expect(await response.text()).toBe("");
    }
  });

  it("answers 404 with no product, no assets directory, or a missing file", async () => {
    expect((await get("logo.svg")).status).toBe(404);
    resetPanelProductState();
    registerProduct(FULL_PRODUCT);
    expect((await get("logo.svg")).status).toBe(404);
    resetPanelProductState();
    const directory = mkdtempSync(path.join(os.tmpdir(), "panel-assets-"));
    copyFileSync(path.join(FIXTURE_ASSETS, "logo.svg"), path.join(directory, "logo.svg"));
    copyFileSync(path.join(FIXTURE_ASSETS, "favicon.ico"), path.join(directory, "favicon.ico"));
    registerProduct(FULL_PRODUCT, directory);
    rmSync(path.join(directory, "logo.svg"));
    expect((await get("logo.svg")).status).toBe(404);
    rmSync(directory, { recursive: true, force: true });
  });
});
