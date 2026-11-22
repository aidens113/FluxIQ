import { expect, it } from "vitest";
import { automationStudioAnswerFirstStepsWithResultProcessing } from "../processing.ts";
import { automaticFeed, SCHEMA } from "../../result-feed/tests/automatic-support.ts";

it("saves actual full retained schema and identity metadata separately from displayed columns", () => {
  const p = automaticFeed({ where: [{ field: "promoted", equals: "false" }], columns: ["title"] });
  const step = p.read("one", [{ id: "a", title: "A", promoted: false, price: "$2" }]);
  const parameters = step.input.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Missing read parameters");
  step.input = { ...step.input, parameters: { ...parameters, recordOutput: { datasetId: "items", recordsPath: "records", writeMode: "append", schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] } } } };
  const saved = automationStudioAnswerFirstStepsWithResultProcessing({ result: p.feed, steps: p.steps });
  expect(saved[0]?.input.parameters).toMatchObject({ recordOutput: { schema: { ...SCHEMA, fields: SCHEMA.fields.filter((field) => field.handling !== "exclude") }, process: { columns: ["title"], declaration: { version: 1 } } } });
  expect(step.input.parameters).toMatchObject({ recordOutput: { schema: { fields: [{ id: "title" }] } } });
});
