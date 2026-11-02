import { expect, it } from "vitest";
import { finalizeRecordingStateLinks as legacy } from "../state-linker.ts";
import { finalizeRecordingStateLinks as canonical } from "../../../../runtime/recording/indexing/index.ts";
import { fixtureIndex } from "../../../../runtime/recording/indexing/tests/fixture.ts";

it("keeps the legacy linker as the same canonical function with the complete result unchanged", () => {
  const input = fixtureIndex();
  const before = structuredClone(input);
  expect(legacy).toBe(canonical);
  expect(legacy(input)).toStrictEqual(canonical(input));
  expect(input).toStrictEqual(before);
});
