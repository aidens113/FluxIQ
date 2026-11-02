import { expect, expectTypeOf, it } from "vitest";
import * as canonical from "../../../../components/automation/importer/index.ts";
import * as legacy from "../importer-sdk.ts";
it("retains the exact importer SDK constructor, validator, version and mapper DTOs", () => {
  expect(Object.keys(legacy).sort()).toEqual(Object.keys(canonical).sort());
  expect(legacy.AutomationStudioImporterSdkRegistry).toBe(canonical.AutomationStudioImporterSdkRegistry);
  expect(legacy.validateAutomationStudioImporterSdkManifest).toBe(canonical.validateAutomationStudioImporterSdkManifest);
  expect(legacy.AUTOMATION_STUDIO_IMPORTER_SDK_VERSION).toBe(canonical.AUTOMATION_STUDIO_IMPORTER_SDK_VERSION);
  expectTypeOf<legacy.AutomationStudioRecordingMapperCandidate>().toEqualTypeOf<canonical.AutomationStudioRecordingMapperCandidate>();
  expectTypeOf<legacy.AutomationStudioRecordingMapperContext>().toEqualTypeOf<canonical.AutomationStudioRecordingMapperContext>();
  expectTypeOf<legacy.AutomationStudioImporterImplementationBundle>().toEqualTypeOf<canonical.AutomationStudioImporterImplementationBundle>();
});
