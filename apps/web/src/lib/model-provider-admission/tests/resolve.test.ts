import { expect, it } from "vitest";
import { resolveFluxIQModelProvidersEnabled } from "../index";

it.each([[undefined, true], ["true", true], ["false", false]] as const)("resolves provider admission %j", (value, expected) => {
  expect(resolveFluxIQModelProvidersEnabled(value === undefined ? {} : { FLUXIQ_MODEL_PROVIDERS_ENABLED: value })).toBe(expected);
});
it.each(["", "0", "1", "FALSE", "off", " true "])("rejects invalid explicit admission %j", (value) => {
  expect(() => resolveFluxIQModelProvidersEnabled({ FLUXIQ_MODEL_PROVIDERS_ENABLED: value })).toThrow("FLUXIQ_MODEL_PROVIDERS_ENABLED");
});
