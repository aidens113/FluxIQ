import { expect, it, vi } from "vitest";
import type { AutomationStudioImporterImplementationBundle, AutomationStudioImporterSdkManifest, AutomationStudioRecordingCandidateParameterNormalizer } from "../../../components/automation/importer/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../index.ts";
import { createElementMatcher } from "../../target-matching/index.ts";

const manifest = (packageId: string, mapperId = "mapper.actual"): AutomationStudioImporterSdkManifest => ({ schemaVersion: "0.1", sdkVersion: "0.1", packageId, packageVersion: "1.0.0", domainId: "domain.actual", nodes: [], recordingMappers: [{ id: mapperId, version: "1.0.0", description: "Actual mapper" }] });
const bundle = (packageId: string, mapperId = "mapper.actual"): AutomationStudioImporterImplementationBundle => ({ packageId, packageVersion: "1.0.0", implementations: {}, recordingMappers: { [mapperId]: () => null } });

it("preserves absent-field shapes and the original raw mapper without a normalizer", () => {
  const implementation = bundle("package.actual");
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest("package.actual"), implementation);
  expect(runtime.getRecordingCandidateParameterNormalizer("domain.actual")).toBeUndefined();
  const mapped = runtime.listRecordingMappers("domain.actual")[0]!;
  expect(Object.keys(mapped)).toEqual(["definition", "packageId", "packageVersion", "implementation"]);
  expect(mapped.implementation).toBe(implementation.recordingMappers!["mapper.actual"]);
  expect(runtime.getRecordingMapper("domain.actual", "mapper.actual")).toBe(mapped.implementation);
});

it("pins the original normalizer function and original bundle receiver across mutation and same-function registration", () => {
  const first = bundle("package.first"), second = bundle("package.second", "mapper.second");
  const normalizer: AutomationStudioRecordingCandidateParameterNormalizer = function (this: AutomationStudioImporterImplementationBundle, domainId, parameters, context) {
    expect(this).toBe(first);
    return { ...parameters, normalizedDomain: domainId, normalizedSource: context.sourceEntryId };
  };
  first.recordingCandidateParameterNormalizer = normalizer;
  second.recordingCandidateParameterNormalizer = normalizer;
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest("package.first"), first);
  const bound = runtime.getRecordingCandidateParameterNormalizer("domain.actual")!;
  const replacement = vi.fn(() => ({ replaced: true }));
  first.recordingCandidateParameterNormalizer = replacement;
  runtime.register(manifest("package.second", "mapper.second"), second);
  expect(runtime.getRecordingCandidateParameterNormalizer("domain.actual")).toBe(bound);
  for (const mapper of runtime.listRecordingMappers("domain.actual")) {
    expect(mapper.normalizeParameters).toBe(bound);
    expect(mapper.normalizeParameters!("domain.actual", { original: true }, { outputId: "output.actual", sourceEntryId: "entry.actual", source: "mapper" })).toEqual({ original: true, normalizedDomain: "domain.actual", normalizedSource: "entry.actual" });
  }
  expect(replacement).not.toHaveBeenCalled();
  expect(runtime.getRecordingCandidateParameterNormalizer("other.domain")).toBeUndefined();
});

it("rejects a conflicting function before SDK, matcher or mapper registration changes", () => {
  const first = bundle("package.first");
  first.recordingCandidateParameterNormalizer = (_domain, parameters) => parameters;
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest("package.first"), first);
  const before = runtime.sdk.list();
  const conflicting = bundle("package.conflict", "mapper.conflict");
  conflicting.recordingCandidateParameterNormalizer = (_domain, parameters) => ({ ...parameters });
  conflicting.elementMatcher = createElementMatcher();
  expect(() => runtime.register(manifest("package.conflict", "mapper.conflict"), conflicting)).toThrow("different recording candidate parameter normalizer");
  expect(runtime.sdk.list()).toEqual(before);
  expect(runtime.getRecordingMapper("domain.actual", "mapper.conflict")).toBeUndefined();
  expect(runtime.getElementMatcher("domain.actual")).toBeUndefined();
});

it("never installs a function from manifest metadata and rejects a non-function bundle hook before registration", () => {
  const runtime = new AutomationStudioNativeNodeRuntime(), executable = vi.fn((_domain: string, parameters: object) => parameters);
  const malformed = bundle("package.invalid");
  Object.defineProperty(malformed, "recordingCandidateParameterNormalizer", { value: "not a function" });
  expect(() => runtime.register(manifest("package.invalid"), malformed)).toThrow("must be a function");
  expect(runtime.sdk.list()).toEqual([]);
  const metadataManifest = manifest("package.metadata");
  const metadata = {};
  Object.defineProperty(metadata, "recordingCandidateParameterNormalizer", { value: executable, enumerable: true });
  metadataManifest.metadata = metadata;
  expect(() => runtime.register(metadataManifest, bundle("package.metadata"))).toThrow();
  expect(runtime.getRecordingCandidateParameterNormalizer("domain.actual")).toBeUndefined();
  expect(executable).not.toHaveBeenCalled();
});
